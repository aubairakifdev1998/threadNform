/**
 * Prepares a disposable Postgres database for the integration suite:
 * Supabase stubs + every migration, applied once per run.
 *
 * INTEGRATION_DATABASE_URL must point at a local, throwaway database.
 * Remote hosts are refused so the suite can never touch production data.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import pg from 'pg';

export default async function setup() {
  const url = process.env.INTEGRATION_DATABASE_URL;
  if (!url) {
    throw new Error(
      'Set INTEGRATION_DATABASE_URL to a local throwaway Postgres database, e.g. postgres://postgres@localhost:5432/fareya_test',
    );
  }
  const host = new URL(url.replace(/^postgresql:/, 'postgres:')).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(
      `Refusing to run integration tests against non-local host "${host}"`,
    );
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // Clean slate every run (some migrations, e.g. CREATE POLICY, are not re-runnable).
    await client.query('set client_min_messages = warning');
    await client.query(
      'drop schema if exists public cascade; drop schema if exists auth cascade; drop schema if exists storage cascade; create schema public;',
    );
    const root = resolve(import.meta.dirname, '../..');
    await client.query(
      await readFile(join(root, 'test/integration/supabase-stubs.sql'), 'utf8'),
    );
    const dir = join(root, 'supabase/migrations');
    for (const file of (await readdir(dir))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      await client.query('set client_min_messages = warning');
      await client.query(await readFile(join(dir, file), 'utf8'));
    }
  } finally {
    await client.end();
  }
}
