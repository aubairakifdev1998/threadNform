import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';
import { DRIZZLE } from './drizzle.tokens.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const connectionString =
          config.get<string>('database.url') ||
          process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error(
            'Missing DATABASE_URL — required for Drizzle ORM',
          );
        }
        const pool = new Pool({
          connectionString,
          max: 10,
          ssl: connectionString.includes('supabase')
            ? { rejectUnauthorized: false }
            : undefined,
        });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DrizzleModule {}
