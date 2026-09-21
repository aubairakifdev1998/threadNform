/**
 * Vercel serverless entry (ESM).
 * Loads the compiled Nest app from api/_nest (copied at build time) so the
 * lambda always resolves modules even when includeFiles paths differ.
 */
export default async function handler(req, res) {
  const origin = typeof req.headers?.origin === 'string' ? req.headers.origin : '';

  const sendError = (status, code, message, details = {}) => {
    if (res.headersSent) return;
    if (origin) {
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
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: { code, message, details } }));
  };

  if (req.method === 'OPTIONS') {
    if (origin) {
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
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const mod = await import('./_nest/vercel.js');
    const nestHandler = mod.default;
    if (typeof nestHandler !== 'function') {
      sendError(500, 'HANDLER_INVALID', 'Nest Vercel export is not a function');
      return;
    }
    await nestHandler(req, res);
  } catch (error) {
    console.error('[api/index] failed to load or run Nest handler', error);
    sendError(
      500,
      'MODULE_LOAD_FAILED',
      error instanceof Error ? error.message : String(error),
      {
        name: error instanceof Error ? error.name : undefined,
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 8) : undefined,
      },
    );
  }
}
