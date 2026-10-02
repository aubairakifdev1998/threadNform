import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type {
  RateLimitDecision,
  RateLimiter,
} from '../../domain/repositories/rate-limiter.js';
import { DRIZZLE, type DrizzleDB } from './drizzle.tokens.js';

@Injectable()
export class DrizzleRateLimiter implements RateLimiter {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async hit(
    key: string,
    windowSeconds: number,
    max: number,
  ): Promise<RateLimitDecision> {
    const result = await this.db.execute(
      sql`select * from public.hit_rate_limit(${key}::text, ${windowSeconds}::int, ${max}::int)`,
    );
    const row = (
      result as unknown as {
        rows?: Array<{ allowed: boolean; retry_after_seconds: number }>;
      }
    ).rows?.[0];
    return {
      allowed: row?.allowed ?? true,
      retryAfterSeconds: Number(row?.retry_after_seconds ?? 1),
    };
  }

  async purgeOlderThan(hours: number): Promise<number> {
    const result = await this.db.execute(
      sql`select public.purge_rate_limit_buckets(make_interval(hours => ${hours}::int)) as purged`,
    );
    const rows = (result as unknown as { rows?: Array<{ purged: number }> })
      .rows;
    return Number(rows?.[0]?.purged ?? 0);
  }
}
