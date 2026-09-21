import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const target = resolve(root, 'api/_nest');

if (!existsSync(resolve(dist, 'vercel.js'))) {
  console.error('Missing dist/vercel.js — run nest build first');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(dist, target, { recursive: true });
console.log('Copied dist → api/_nest for Vercel function bundle');
