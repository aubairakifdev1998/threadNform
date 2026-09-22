import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './infrastructure/config/configuration.js';
import { validateEnv } from './infrastructure/config/env.validation.js';
import { DrizzleModule } from './infrastructure/drizzle/drizzle.module.js';
import { SupabaseModule } from './infrastructure/supabase/supabase.module.js';
import { AuthModule } from './presentation/auth/auth.module.js';
import { CommerceModule } from './presentation/commerce/commerce.module.js';
import { HealthModule } from './presentation/health/health.module.js';
import { StorageModule } from './presentation/storage/storage.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // @nestjs/throttler is still CommonJS and breaks Nest 12 ESM on Vercel's
    // Node runtime (ERR_REQUIRE_ESM). Re-add when an ESM build ships.
    DrizzleModule,
    SupabaseModule,
    AuthModule,
    CommerceModule,
    StorageModule,
    HealthModule,
  ],
})
export class AppModule {}
