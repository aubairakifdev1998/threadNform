#!/usr/bin/env node
/**
 * Apply supabase/migrations/*.sql in order using DATABASE_URL.
 *
 * Prefer Session pooler URI (IPv4) from Supabase Dashboard → Database → Connect.
 * Direct host `db.<ref>.supabase.co` often fails DNS on free projects.
 *
 * Usage: npm run db:migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from 'dotenv';

config({
  path: join(dirname(fileURLToPath(import.meta.url)), '../.env'),
  override: true,
});

function rewriteDirectToPooler(url) {
  try {
    const u = new URL(url.replace(/^postgresql:/, 'postgres:'));
    const m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (!m) return null;
    const ref = m[1];
    const region = process.env.SUPABASE_DB_REGION || 'ap-south-1';
    const password = decodeURIComponent(u.password);
    const db = (u.pathname || '/postgres').replace(/^\//, '') || 'postgres';
    return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:5432/${db}`;
  } catch {
    return null;
  }
}

async function connectWithFallback(databaseUrl) {
  const candidates = [databaseUrl];
  const pooler = rewriteDirectToPooler(databaseUrl);
  if (pooler && pooler !== databaseUrl) candidates.push(pooler);
  if (process.env.DATABASE_POOLER_URL) {
    candidates.unshift(process.env.DATABASE_POOLER_URL);
  }

  let lastError;
  for (const cs of candidates) {
    const host = (() => {
      try {
        return new URL(cs.replace(/^postgresql:/, 'postgres:')).hostname;
      } catch {
        return '(invalid)';
      }
    })();
    const client = new pg.Client({
      connectionString: cs,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12_000,
    });
    try {
      await client.connect();
      if (cs !== databaseUrl) {
        console.log(`Connected via pooler host: ${host}`);
      } else {
        console.log(`Connected via: ${host}`);
      }
      return client;
    } catch (err) {
      lastError = err;
      console.warn(`Connect failed (${host}): ${err.code || err.message}`);
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  throw lastError;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(`
Missing DATABASE_URL.

1. Open Supabase Dashboard → Project Settings → Database → Connect
2. Copy the Session pooler URI (port 5432), e.g.
   postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
3. Put it in backend/.env as DATABASE_URL=

Then re-run: npm run db:migrate
`);
  process.exit(1);
}

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../supabase/migrations',
);

let client;
try {
  client = await connectWithFallback(databaseUrl);
} catch (err) {
  console.error(`
Could not connect to Postgres.

Error: ${err.code || ''} ${err.message}

Fix:
- Use Session pooler URI from Supabase → Database → Connect (not Direct).
- Set SUPABASE_DB_REGION if auto-fallback region is wrong (e.g. ap-south-1).
- Or set DATABASE_POOLER_URL explicitly in .env.
`);
  process.exit(1);
}

await client.query(`
  create table if not exists public.schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  );
`);

const files = (await readdir(migrationsDir))
  .filter((f) => f.endsWith('.sql'))
  .sort();

for (const file of files) {
  const { rows } = await client.query(
    'select 1 from public.schema_migrations where filename = $1',
    [file],
  );
  if (rows.length) {
    console.log(`skip  ${file} (already applied)`);
    continue;
  }

  const sql = await readFile(join(migrationsDir, file), 'utf8');
  console.log(`apply ${file} ...`);
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query(
      'insert into public.schema_migrations (filename) values ($1)',
      [file],
    );
    await client.query('commit');
    console.log(`ok    ${file}`);
  } catch (err) {
    await client.query('rollback');
    console.error(`FAIL  ${file}`);
    console.error(err.message);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log('All migrations applied.');
