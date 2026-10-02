export type EnvVars = {
  PORT?: string;
  API_PREFIX?: string;
  CORS_ORIGINS?: string;
  CART_TOKEN_SECRET?: string;
  CRON_SECRET?: string;
  IDEMPOTENCY_TTL_HOURS?: string;
  MAX_UPLOAD_BYTES?: string;
  DEFAULT_CURRENCY?: string;
  DEFAULT_COUNTRY?: string;
  DATABASE_URL: string;
  SUPABASE_URL: string;
  /** New API key (preferred) */
  SUPABASE_PUBLISHABLE_KEY?: string;
  /** New secret key (preferred) */
  SUPABASE_SECRET_KEY?: string;
  /** Legacy JWT anon key */
  SUPABASE_ANON_KEY?: string;
  /** Legacy JWT service_role key */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_JWKS_URL?: string;
  SUPABASE_STORAGE_BUCKET?: string;
  SUPABASE_STORAGE_BUCKET_PRODUCTS?: string;
  SUPABASE_STORAGE_BUCKET_PAYMENT_PROOFS?: string;
};

function hasValue(config: Record<string, unknown>, key: string): boolean {
  return typeof config[key] === 'string' && (config[key] as string).length > 0;
}

export function validateEnv(config: Record<string, unknown>): EnvVars {
  if (!hasValue(config, 'SUPABASE_URL')) {
    throw new Error('Missing required environment variable: SUPABASE_URL');
  }
  if (!hasValue(config, 'DATABASE_URL')) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }

  const hasPublishable =
    hasValue(config, 'SUPABASE_PUBLISHABLE_KEY') ||
    hasValue(config, 'SUPABASE_ANON_KEY');
  const hasSecret =
    hasValue(config, 'SUPABASE_SECRET_KEY') ||
    hasValue(config, 'SUPABASE_SERVICE_ROLE_KEY');

  if (!hasPublishable) {
    throw new Error(
      'Missing Supabase public key: set SUPABASE_PUBLISHABLE_KEY (or legacy SUPABASE_ANON_KEY)',
    );
  }
  if (!hasSecret) {
    throw new Error(
      'Missing Supabase secret key: set SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)',
    );
  }

  // The cart secret signs guest cart tokens and order view links; the
  // built-in fallback is public, so production must set its own.
  const isProduction =
    config.NODE_ENV === 'production' || config.VERCEL === '1';
  if (isProduction) {
    const secret = config.CART_TOKEN_SECRET;
    if (typeof secret !== 'string' || secret.length < 32) {
      throw new Error(
        'CART_TOKEN_SECRET must be set to a random string of at least 32 characters in production',
      );
    }
  }

  return config as EnvVars;
}
