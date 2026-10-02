import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { RATE_LIMITER } from '../../domain/repositories/rate-limiter.js';
import { UNIT_OF_WORK } from '../../domain/repositories/unit-of-work.js';
import { DrizzleRateLimiter } from './drizzle-rate-limiter.js';
import { DrizzleUnitOfWork } from './drizzle-unit-of-work.js';
import * as schema from './schema/index.js';
import { DRIZZLE } from './drizzle.tokens.js';

const DRIZZLE_UNIT_OF_WORK = Symbol('DRIZZLE_UNIT_OF_WORK');

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DRIZZLE_UNIT_OF_WORK,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const connectionString =
          config.get<string>('database.url') || process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error('Missing DATABASE_URL — required for Drizzle ORM');
        }
        // Serverless instances are many and short-lived: keep each pool tiny
        // and release idle connections fast, or warm instances exhaust the
        // Supabase pooler's client limit (15 in session mode).
        const serverless = Boolean(process.env.VERCEL);
        const pool = new Pool({
          connectionString,
          max: Number(process.env.DATABASE_POOL_MAX) || (serverless ? 2 : 10),
          idleTimeoutMillis: serverless ? 5_000 : 30_000,
          ssl: connectionString.includes('supabase')
            ? { rejectUnauthorized: false }
            : undefined,
        });
        return new DrizzleUnitOfWork(drizzle(pool, { schema }));
      },
    },
    {
      provide: DRIZZLE,
      inject: [DRIZZLE_UNIT_OF_WORK],
      useFactory: (uow: DrizzleUnitOfWork) => uow.createScopedDb(),
    },
    {
      provide: UNIT_OF_WORK,
      useExisting: DRIZZLE_UNIT_OF_WORK,
    },
    { provide: RATE_LIMITER, useClass: DrizzleRateLimiter },
  ],
  exports: [DRIZZLE, UNIT_OF_WORK, RATE_LIMITER],
})
export class DrizzleModule {}
