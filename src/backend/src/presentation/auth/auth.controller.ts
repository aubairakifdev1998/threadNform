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
  ) {}

  @Post('sign-up')
  signUp(@Body() dto: SignUpDto) {
    return this.signUpUseCase.execute({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
      emailRedirectTo: dto.emailRedirectTo,
    });
  }

  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  signIn(@Body() dto: SignInDto) {
    return this.signInUseCase.execute({
      email: dto.email,
      password: dto.password,
    });
  }

  @Get('oauth/google')
  googleOAuth(@Query() query: GoogleOAuthQueryDto) {
    const redirectTo =
      query.redirectTo ?? 'http://localhost:3001/auth/callback';
    return this.authRepository.getGoogleOAuthUrl(redirectTo);
  }

  @Post('oauth/exchange')
  @HttpCode(HttpStatus.OK)
  exchangeOAuth(@Body() dto: ExchangeOAuthCodeDto) {
    return this.authRepository.exchangeOAuthCode(dto.code);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const frontendUrl =
      this.config.get<string>('frontendUrl') ?? 'http://localhost:3001';
    const redirectTo =
      dto.redirectTo ??
      `${frontendUrl.replace(/\/$/, '')}/auth/callback`;
    await this.authRepository.requestPasswordReset(dto.email, redirectTo);
    return {
      message:
        'If an account exists for that email, a reset link has been sent.',
    };
  }

  @Post('change-password')
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
  async me(@CurrentUser() user: User) {
    const admin = await this.adminUsers.findById(user.id);
    const isAdmin = Boolean(admin && admin.status === 'ACTIVE');
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
