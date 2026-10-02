export type PgErrorInfo = {
  code: string;
  message: string;
  constraint?: string;
};

/**
 * Drizzle wraps driver errors (DrizzleQueryError → cause: pg DatabaseError).
 * Walks the cause chain and returns the Postgres SQLSTATE error, if any.
 */
export function findPgError(error: unknown): PgErrorInfo | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const candidate = current as {
      code?: unknown;
      message?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (
      typeof candidate.code === 'string' &&
      /^[0-9A-Z]{5}$/.test(candidate.code)
    ) {
      return {
        code: candidate.code,
        message: String(candidate.message ?? ''),
        constraint:
          typeof candidate.constraint === 'string'
            ? candidate.constraint
            : undefined,
      };
    }
    current = candidate.cause;
  }
  return null;
}

/** Message raised by a PL/pgSQL `raise exception`, falling back to the wrapper's. */
export function rpcErrorMessage(error: unknown): string {
  const pg = findPgError(error);
  if (pg) return pg.message;
  return error instanceof Error ? error.message : String(error);
}
