#!/usr/bin/env node
/**
 * Fresh-start wipe: customers, products, inventory, and dependent commerce data.
 * Keeps: admin_users, warehouses, vat_rates, shipping_methods, payment_bank_accounts,
 *        departments/categories, size systems, platform_settings, site billboards.
 *
 * Usage: node scripts/wipe-commerce-data.mjs [--yes]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import pg from 'pg';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

const yes = process.argv.includes('--yes');
if (!yes) {
  console.error('Refusing to run without --yes (destructive).');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!databaseUrl || !supabaseUrl || !supabaseKey) {
  console.error('Missing DATABASE_URL / SUPABASE_URL / SUPABASE_SECRET_KEY');
  process.exit(1);
}

const hostHint = databaseUrl.replace(/:[^:@/]+@/, ':****@').split('?')[0];
console.log('Target DB:', hostHint);
console.log('Supabase:', supabaseUrl);

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const countTables = [
  'customers',
  'customer_addresses',
  'carts',
  'cart_items',
  'orders',
  'order_items',
  'payments',
  'payment_proofs',
  'return_requests',
  'products',
  'product_variants',
  'product_media',
  'product_prices',
  'brands',
  'collections',
  'inventory_items',
  'inventory_movements',
  'customer_reviews',
  'admin_users',
];

async function snapshot(label) {
  console.log(`\n${label}`);
  for (const table of countTables) {
    try {
      const { rows } = await client.query(`SELECT count(*)::int AS c FROM ${table}`);
      console.log(`  ${table.padEnd(22)} ${rows[0].c}`);
    } catch (error) {
      console.log(`  ${table.padEnd(22)} (missing: ${error.message})`);
    }
  }
}

await snapshot('Before');

await client.query('BEGIN');
try {
  // Dependent commerce + catalog + inventory. CASCADE clears FKs safely.
  await client.query(`
    TRUNCATE TABLE
      return_items,
      return_requests,
      payment_proofs,
      payments,
      order_status_history,
      order_addresses,
      order_items,
      orders,
      cart_items,
      carts,
      customer_addresses,
      customers,
      inventory_movements,
      inventory_items,
      product_variant_options,
      product_prices,
      product_media,
      product_attributes,
      product_collections,
      product_variants,
      products,
      brands,
      collections,
      colors,
      customer_reviews,
      idempotency_keys,
      order_number_sequences
    RESTART IDENTITY CASCADE
  `);
  await client.query('COMMIT');
  console.log('\nTRUNCATE committed.');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('TRUNCATE failed:', error.message);
  await client.end();
  process.exit(1);
}

await snapshot('After');

const sb = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: admins, error: adminErr } = await sb
  .from('admin_users')
  .select('id, email');
if (adminErr) {
  console.error('Could not load admin_users:', adminErr.message);
} else {
  const adminIds = new Set((admins ?? []).map((a) => a.id));
  console.log(`\nKeeping ${adminIds.size} admin auth user(s):`, [...adminIds].map((id) => {
    const row = admins.find((a) => a.id === id);
    return row?.email ?? id;
  }).join(', ') || '(none)');

  let deletedAuth = 0;
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error('listUsers failed:', error.message);
      break;
    }
    const users = data?.users ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      if (adminIds.has(user.id)) continue;
      const { error: delErr } = await sb.auth.admin.deleteUser(user.id);
      if (delErr) {
        console.error(`  auth delete ${user.email}: ${delErr.message}`);
      } else {
        deletedAuth += 1;
        console.log(`  deleted auth user ${user.email ?? user.id}`);
      }
    }
    if (users.length < 200) break;
    page += 1;
  }
  console.log(`Auth users deleted: ${deletedAuth}`);
}

const buckets = [
  process.env.SUPABASE_STORAGE_BUCKET_PRODUCTS ??
    process.env.SUPABASE_STORAGE_BUCKET ??
    'products',
  process.env.SUPABASE_STORAGE_BUCKET_PAYMENT_PROOFS ?? 'payment-proofs',
];

for (const bucket of buckets) {
  let removed = 0;
  async function wipeFolder(prefix) {
    const { data: entries, error } = await sb.storage.from(bucket).list(prefix, {
      limit: 1000,
    });
    if (error) {
      console.error(`  list ${bucket}/${prefix}: ${error.message}`);
      return;
    }
    if (!entries?.length) return;

    const files = [];
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id == null && !entry.metadata) {
        // folder
        await wipeFolder(path);
      } else {
        files.push(path);
      }
    }
    if (files.length) {
      const { error: rmErr } = await sb.storage.from(bucket).remove(files);
      if (rmErr) console.error(`  remove ${bucket}: ${rmErr.message}`);
      else removed += files.length;
    }
  }
  console.log(`\nClearing storage bucket: ${bucket}`);
  await wipeFolder('');
  console.log(`  removed ~${removed} object(s)`);
}

await client.end();
console.log('\nFresh start wipe complete. Admin + UK seed taxonomy retained.');
