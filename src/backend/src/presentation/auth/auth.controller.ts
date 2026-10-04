import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { RefreshSessionUseCase } from '../../application/use-cases/auth/refresh-session.use-case.js';
import { SignInUseCase } from '../../application/use-cases/auth/sign-in.use-case.js';
import { SignOutUseCase } from '../../application/use-cases/auth/sign-out.use-case.js';
import { SignUpUseCase } from '../../application/use-cases/auth/sign-up.use-case.js';
import type { User } from '../../domain/entities/user.entity.js';
import {
  ADMIN_USER_REPOSITORY,
  type AdminUserRepository,
} from '../../domain/repositories/admin-user.repository.js';
import {
  AUTH_REPOSITORY,
  type AuthRepository,
} from '../../domain/repositories/auth.repository.js';
import {
  AccessToken,
  CurrentUser,
} from './decorators/current-user.decorator.js';
import { RefreshSessionDto } from './dto/refresh-session.dto.js';
import { SignInDto } from './dto/sign-in.dto.js';
import { SignUpDto } from './dto/sign-up.dto.js';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../../domain/repositories/customer.repository.js';
import { ForbiddenException } from '../../domain/exceptions/domain.exception.js';
import { assertAllowedFrontendRedirect } from '../commerce/order-access.js';

class GoogleOAuthQueryDto {
  @IsOptional()
  @IsString()
  redirectTo?: string;
}

class ExchangeOAuthCodeDto {
  @IsString()
  code!: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  redirectTo?: string;
}

class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly signUpUseCase: SignUpUseCase,
    private readonly signInUseCase: SignInUseCase,
    private readonly signOutUseCase: SignOutUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    private readonly config: ConfigService,
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly adminUsers: AdminUserRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customers: CustomerRepository,
  ) {}

  private frontendOrigin() {
    return this.config.get<string>('frontendUrl') ?? 'http://localhost:3001';
  }

  @Post('sign-up')
  @RateLimit({ name: 'sign-up', max: 5, windowSeconds: 3600 })
  signUp(@Body() dto: SignUpDto) {
    const emailRedirectTo = assertAllowedFrontendRedirect(
      dto.emailRedirectTo,
      this.frontendOrigin(),
    );
    return this.signUpUseCase.execute({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
      emailRedirectTo,
    });
  }

  @Post('sign-in')
  @RateLimit(
    { name: 'sign-in', max: 20, windowSeconds: 300 },
    { name: 'sign-in-email', max: 10, windowSeconds: 900, by: 'body:email' },
  )
  @HttpCode(HttpStatus.OK)
  signIn(@Body() dto: SignInDto) {
    return this.signInUseCase.execute({
      email: dto.email,
      password: dto.password,
    });
  }

  @Get('oauth/google')
  googleOAuth(@Query() query: GoogleOAuthQueryDto) {
    const redirectTo = assertAllowedFrontendRedirect(
      query.redirectTo,
      this.frontendOrigin(),
    );
    return this.authRepository.getGoogleOAuthUrl(redirectTo);
  }

  @Post('oauth/exchange')
  @RateLimit({ name: 'oauth-exchange', max: 30, windowSeconds: 300 })
  @HttpCode(HttpStatus.OK)
  async exchangeOAuth(@Body() dto: ExchangeOAuthCodeDto) {
    const session = await this.authRepository.exchangeOAuthCode(dto.code);
    const customer = await this.customers.findById(session.user.id);
    if (customer?.status === 'BLOCKED') {
      try {
        await this.authRepository.signOut(session.accessToken);
      } catch {
        // Best-effort revoke.
      }
      throw new ForbiddenException(
        'This account cannot sign in. Please contact support.',
        'ACCOUNT_BLOCKED',
      );
    }
    return session;
  }

  @Post('forgot-password')
  @RateLimit(
    { name: 'forgot-password', max: 5, windowSeconds: 3600 },
    {
      name: 'forgot-password-email',
      max: 3,
      windowSeconds: 3600,
      by: 'body:email',
    },
  )
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const redirectTo = assertAllowedFrontendRedirect(
      dto.redirectTo,
      this.frontendOrigin(),
    );
    await this.authRepository.requestPasswordReset(dto.email, redirectTo);
    return {
      message:
        'If an account exists for that email, a reset link has been sent.',
    };
  }

  @Post('change-password')
  @RateLimit({ name: 'change-password', max: 10, windowSeconds: 3600 })
  @HttpCode(HttpStatus.OK)
  @UseGuards(SupabaseAuthGuard)
  async changePassword(
    @AccessToken() accessToken: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authRepository.updatePassword(accessToken, dto.newPassword);
    return { message: 'Password updated' };
  }

  @Post('refresh')
  @RateLimit({ name: 'refresh', max: 60, windowSeconds: 300 })
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshSessionDto) {
    return this.refreshSessionUseCase.execute(dto.refreshToken);
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SupabaseAuthGuard)
  async signOut(@AccessToken() accessToken: string) {
    await this.signOutUseCase.execute(accessToken);
  }

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  async me(@CurrentUser() user: User, @AccessToken() accessToken: string) {
    const admin = await this.adminUsers.findById(user.id);
    const isAdmin = Boolean(admin && admin.status === 'ACTIVE');
    if (!isAdmin) {
      const customer = await this.customers.findById(user.id);
      if (customer?.status === 'BLOCKED') {
        try {
          await this.signOutUseCase.execute(accessToken);
        } catch {
          // Best-effort revoke.
        }
        throw new ForbiddenException(
          'This account cannot sign in. Please contact support.',
          'ACCOUNT_BLOCKED',
        );
      }
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isAdmin,
      adminRole: isAdmin && admin ? admin.role : null,
    };
  }
}
