/**
 * Vercel serverless entry.
 * framework is disabled in vercel.json so this Node handler is used instead of
 * Vercel's Nest auto-detector (which failed when main.ts only imported bootstrap).
 */
export { default } from '../dist/vercel.js';
