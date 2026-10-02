export const RATE_LIMITER = Symbol('RATE_LIMITER');

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

/** Counts one hit against `key` in a fixed window shared by all instances. */
export interface RateLimiter {
  hit(key: string, windowSeconds: number, max: number): Promise<RateLimitDecision>;
  purgeOlderThan(hours: number): Promise<number>;
}
