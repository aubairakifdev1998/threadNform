import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export type RateLimitRule = {
  /** Bucket name; keep stable, it is part of the stored key. */
  name: string;
  max: number;
  windowSeconds: number;
  /** What a bucket is per: client IP (default) or a JSON body field. */
  by?: 'ip' | `body:${string}`;
};

/** Every rule must pass; the first exceeded rule rejects with 429. */
export const RateLimit = (...rules: RateLimitRule[]) =>
  SetMetadata(RATE_LIMIT_KEY, rules);
