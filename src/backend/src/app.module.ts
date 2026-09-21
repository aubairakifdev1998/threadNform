import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttlMs') ?? 60_000,
          limit: config.get<number>('throttle.limit') ?? 120,
        },
      ],
    }),
    DrizzleModule,
    SupabaseModule,
    AuthModule,
    CommerceModule,
    StorageModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
