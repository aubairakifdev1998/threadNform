import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { createNestApp } from './bootstrap.js';

let cachedExpress: Express | null = null;
let initPromise: Promise<Express> | null = null;

async function getExpressApp(): Promise<Express> {
  if (cachedExpress) return cachedExpress;
  if (!initPromise) {
    initPromise = createNestApp()
      .then(({ expressApp }) => {
        cachedExpress = expressApp;
        return expressApp;
      })
      .catch((error) => {
        // Allow the next invocation to retry after a failed cold start
        initPromise = null;
        throw error;
      });
  }
  return initPromise;
}

/**
 * Vercel serverless entry. Keep cold-start failures visible in function logs
 * (missing env vars, DB, etc.) — those previously surfaced only as CORS errors.
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const server = await getExpressApp();
    server(req, res);
  } catch (error) {
    console.error('[vercel] Nest bootstrap failed', error);
    if (!res.headersSent) {
      const origin = req.headers.origin;
      if (typeof origin === 'string' && origin.length > 0) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, Idempotency-Key, X-Guest-Token, Accept',
        );
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        );
      }
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: {
            code: 'BOOTSTRAP_FAILED',
            message:
              error instanceof Error
                ? error.message
                : 'Backend failed to start',
            details: {},
          },
        }),
      );
    }
  }
}
