import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import serverless from 'serverless-http';
import { NestFactory } from '@nestjs/core';
import { createNestApp } from './bootstrap.js';

// Keep a direct @nestjs/core import for platform entrypoint detection.
void NestFactory;

type ServerlessHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<unknown> | unknown;

let cachedHandler: ServerlessHandler | null = null;
let initPromise: Promise<ServerlessHandler> | null = null;

async function getHandler(): Promise<ServerlessHandler> {
  if (cachedHandler) return cachedHandler;
  if (!initPromise) {
    initPromise = createNestApp()
      .then(({ expressApp }) => {
        const wrapped = serverless(expressApp) as ServerlessHandler;
        cachedHandler = wrapped;
        return wrapped;
      })
      .catch((error) => {
        initPromise = null;
        throw error;
      });
  }
  return initPromise;
}

/**
 * Vercel serverless entry. Boot failures are caught by api/index.js as well.
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const run = await getHandler();
    await run(req, res);
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
            details: {
              stack:
                error instanceof Error
                  ? error.stack?.split('\n').slice(0, 8)
                  : undefined,
            },
          },
        }),
      );
    }
  }
}
