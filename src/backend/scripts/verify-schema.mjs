#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

const url = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const required = [
  'departments',
  'categories',
  'products',
  'product_variants',
  'warehouses',
  'inventory_items',
  'carts',
  'orders',
  'payments',
  'vat_rates',
  'shipping_methods',
  'payment_bank_accounts',
  'admin_users',
  'customers',
];

let failed = 0;
for (const table of required) {
  const { error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    console.error(`✗ ${table}: ${error.message}`);
    failed += 1;
  } else {
    console.log(`✓ ${table}`);
  }
}

const { data: deps } = await sb.from('departments').select('slug');
const { data: vat } = await sb.from('vat_rates').select('code').eq('is_default', true);
const { data: wh } = await sb.from('warehouses').select('code').eq('is_default', true);
const { data: ship } = await sb.from('shipping_methods').select('code').eq('is_active', true);

console.log('\nSeed check:');
console.log('  departments:', deps?.length ?? 0);
console.log('  default VAT:', vat?.[0]?.code ?? 'MISSING');
console.log('  default warehouse:', wh?.[0]?.code ?? 'MISSING');
console.log('  shipping methods:', ship?.map((s) => s.code).join(', ') || 'MISSING');

const { error: rpcError } = await sb.rpc('allocate_order_number', { p_year: 2099 });
console.log('  allocate_order_number RPC:', rpcError ? rpcError.message : 'ok');

const { data: buckets } = await sb.storage.listBuckets();
console.log(
  '  storage buckets:',
  buckets?.map((b) => b.name).join(', ') || 'none',
);

if (failed) {
  console.error(`\n${failed} table(s) missing. Run: npm run db:migrate`);
  process.exit(1);
}

console.log('\nSchema looks ready for the API.');
