import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../infrastructure/supabase/supabase.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [SupabaseModule],
  controllers: [HealthController],
})
export class HealthModule {}
