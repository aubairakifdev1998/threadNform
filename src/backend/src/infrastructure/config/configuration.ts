export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
  corsOrigins: (process.env.CORS_ORIGINS ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  cartTokenSecret: process.env.CART_TOKEN_SECRET ?? 'dev-cart-secret-change-me',
  idempotencyTtlHours: parseInt(process.env.IDEMPOTENCY_TTL_HOURS ?? '24', 10),
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES ?? '10485760', 10),
  defaultCurrency: process.env.DEFAULT_CURRENCY ?? 'GBP',
  defaultCountry: process.env.DEFAULT_COUNTRY ?? 'GB',
  throttle: {
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'Thread N Form <noreply@threadnform.com>',
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey:
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      '',
    serviceRoleKey:
      process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      '',
    jwksUrl:
      process.env.SUPABASE_JWKS_URL ??
      (process.env.SUPABASE_URL
        ? `${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`
        : ''),
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'products',
    productsBucket:
      process.env.SUPABASE_STORAGE_BUCKET_PRODUCTS ??
      process.env.SUPABASE_STORAGE_BUCKET ??
      'products',
    paymentProofsBucket:
      process.env.SUPABASE_STORAGE_BUCKET_PAYMENT_PROOFS ?? 'payment-proofs',
  },
});
