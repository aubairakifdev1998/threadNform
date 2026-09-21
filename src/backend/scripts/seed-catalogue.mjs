#!/usr/bin/env node
/**
 * Seeds a sellable SIMPLE catalogue so cart → checkout → payment proof works.
 * Usage: node scripts/seed-catalogue.mjs
 * Requires: backend running on :3000 and .admin-credentials.local
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const API = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1';

function loadCreds() {
  const path = resolve(root, '.admin-credentials.local');
  if (!existsSync(path)) throw new Error('Missing .admin-credentials.local');
  const raw = readFileSync(path, 'utf8');
  const email = raw.match(/^OWNER_EMAIL=(.+)$/m)?.[1]?.trim();
  const password = raw.match(/^OWNER_PASSWORD=(.+)$/m)?.[1]?.trim();
  if (!email || !password) throw new Error('OWNER_EMAIL/PASSWORD missing');
  return { email, password };
}

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(
      `${method} ${path} → ${res.status} ${json?.error?.message ?? JSON.stringify(json)}`,
    );
  }
  return json.data;
}

const PRODUCTS = [
  {
    name: 'Essential Crew Tee',
    slug: 'essential-crew-tee',
    description: 'Soft cotton crew neck in bone. Everyday Thread N Form staple.',
    basePricePence: 4500,
    sku: 'TNF-TEE-CREW-01',
  },
  {
    name: 'Structured Overshirt',
    slug: 'structured-overshirt',
    description: 'Washed cotton overshirt with clean seams and a relaxed fall.',
    basePricePence: 8900,
    sku: 'TNF-SHIRT-OVER-01',
  },
  {
    name: 'Pleated Wide Trouser',
    slug: 'pleated-wide-trouser',
    description: 'High-rise wide leg with a soft pleat. UK sizing.',
    basePricePence: 9800,
    sku: 'TNF-TRSR-WIDE-01',
  },
];

async function main() {
  const creds = loadCreds();
  console.log('Signing in as owner…');
  const session = await api('/auth/sign-in', {
    method: 'POST',
    body: creds,
  });
  const token = session.accessToken;

  const departments = await api('/departments');
  const women =
    departments.find((d) => d.slug === 'women') ?? departments[0] ?? null;

  const warehouses = await api('/admin/warehouses', { token });
  const warehouse = Array.isArray(warehouses)
    ? warehouses.find((w) => w.isDefault) ?? warehouses[0]
    : null;
  if (!warehouse) throw new Error('No warehouse found — run migrations');

  for (const product of PRODUCTS) {
    console.log(`Creating ${product.slug}…`);
    let created;
    try {
      created = await api('/admin/products', {
        method: 'POST',
        token,
        body: {
          name: product.name,
          slug: product.slug,
          description: product.description,
          productType: 'SIMPLE',
          departmentId: women?.id,
          basePricePence: product.basePricePence,
          sku: product.sku,
        },
      });
    } catch (err) {
      if (String(err.message).includes('duplicate') || String(err.message).includes('slug')) {
        console.log(`  skip (exists): ${product.slug}`);
        continue;
      }
      throw err;
    }

    const detail = await api(`/products/${product.slug}`);
    const variant = detail.variants?.[0];
    if (!variant?.id) {
      console.warn(`  no variant on ${product.slug}`);
      continue;
    }

    await api('/admin/inventory/adjust', {
      method: 'POST',
      token,
      body: {
        warehouseId: warehouse.id,
        variantId: variant.id,
        onHandDelta: 25,
        reason: 'Catalogue seed',
        movementType: 'MANUAL_ADJUSTMENT',
      },
    });
    console.log(`  stocked variant ${variant.sku ?? variant.id} (+25)`);
  }

  const listed = await api('/products?pageSize=10');
  console.log(`Done. Public products: ${listed.total}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
