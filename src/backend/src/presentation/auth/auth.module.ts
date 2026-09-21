import { Module } from '@nestjs/common';
import { GetCurrentUserUseCase } from '../../application/use-cases/auth/get-current-user.use-case.js';
import { RefreshSessionUseCase } from '../../application/use-cases/auth/refresh-session.use-case.js';
import { SignInUseCase } from '../../application/use-cases/auth/sign-in.use-case.js';
import { SignOutUseCase } from '../../application/use-cases/auth/sign-out.use-case.js';
import { SignUpUseCase } from '../../application/use-cases/auth/sign-up.use-case.js';
import { SupabaseModule } from '../../infrastructure/supabase/supabase.module.js';
import { AuthController } from './auth.controller.js';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard.js';

@Module({
  imports: [SupabaseModule],
  controllers: [AuthController],
  providers: [
    SignUpUseCase,
    SignInUseCase,
    SignOutUseCase,
    GetCurrentUserUseCase,
    RefreshSessionUseCase,
    SupabaseAuthGuard,
  ],
  exports: [GetCurrentUserUseCase, SupabaseAuthGuard],
})
export class AuthModule {}
