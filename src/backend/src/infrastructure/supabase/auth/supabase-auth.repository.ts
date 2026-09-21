import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  type SupabaseClient,
  type User as SupabaseAuthUser,
} from '@supabase/supabase-js';
import { AuthSession } from '../../../domain/entities/auth-session.entity.js';
import { User } from '../../../domain/entities/user.entity.js';
import {
  ConflictException,
  UnauthorizedException,
  ValidationException,
} from '../../../domain/exceptions/domain.exception.js';
import type {
  AuthRepository,
  SignInInput,
  SignUpInput,
  SignUpResult,
} from '../../../domain/repositories/auth.repository.js';
import { SUPABASE_CLIENT } from '../supabase.tokens.js';

@Injectable()
export class SupabaseAuthRepository implements AuthRepository {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly config: ConfigService,
  ) {}

  async signUp(input: SignUpInput): Promise<SignUpResult> {
    const frontendUrl =
      this.config.get<string>('frontendUrl') ?? 'http://localhost:3001';
    const emailRedirectTo =
      input.emailRedirectTo ?? `${frontendUrl.replace(/\/$/, '')}/auth/callback`;

    const { data, error } = await this.supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo,
        data: {
          full_name: input.fullName ?? null,
          brand: 'Thread N Form',
        },
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        throw new ConflictException('A user with this email already exists');
      }
      throw new ValidationException(error.message);
    }

    if (!data.user) {
      throw new ValidationException('Sign-up failed. Please try again.');
    }

    if (!data.session) {
      return {
        status: 'confirmation_required',
        email: data.user.email ?? input.email,
        message:
          'Check your inbox to confirm your email with Thread N Form, then sign in.',
      };
    }

    return {
      status: 'authenticated',
      session: this.toAuthSession(data.session, data.user),
    };
  }

  async signIn(input: SignInInput): Promise<AuthSession> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error || !data.session || !data.user) {
      throw new UnauthorizedException(error?.message ?? 'Invalid credentials');
    }

    return this.toAuthSession(data.session, data.user);
  }

  async getGoogleOAuthUrl(redirectTo: string): Promise<{ url: string }> {
    const { data, error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error || !data.url) {
      throw new ValidationException(
        error?.message ??
          'Google sign-in is not available. Enable the Google provider in Supabase Auth.',
      );
    }

    return { url: data.url };
  }

  async exchangeOAuthCode(code: string): Promise<AuthSession> {
    const { data, error } =
      await this.supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session || !data.user) {
      throw new UnauthorizedException(
        error?.message ?? 'Unable to complete Google sign-in',
      );
    }
    return this.toAuthSession(data.session, data.user);
  }

  async signOut(accessToken: string): Promise<void> {
    const client = this.createUserScopedClient(accessToken);
    const { error } = await client.auth.signOut();
    if (error) {
      throw new UnauthorizedException(error.message);
    }
  }

  async getUserFromToken(accessToken: string): Promise<User> {
    const { data, error } = await this.supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new UnauthorizedException(
        error?.message ?? 'Invalid or expired token',
      );
    }

    return this.toUser(data.user);
  }

  async refreshSession(refreshToken: string): Promise<AuthSession> {
    const { data, error } = await this.supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session || !data.user) {
      throw new UnauthorizedException(
        error?.message ?? 'Unable to refresh session',
      );
    }

    return this.toAuthSession(data.session, data.user);
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) {
      throw new ValidationException(error.message);
    }
  }

  async updatePassword(
    accessToken: string,
    newPassword: string,
  ): Promise<void> {
    const client = this.createUserScopedClient(accessToken);
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) {
      throw new ValidationException(error.message);
    }
  }

  private createUserScopedClient(accessToken: string): SupabaseClient {
    return createClient(
      this.config.getOrThrow<string>('supabase.url'),
      this.config.getOrThrow<string>('supabase.anonKey'),
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  private toAuthSession(
    session: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      expires_at?: number;
    },
    supabaseUser: SupabaseAuthUser,
  ): AuthSession {
    return new AuthSession(
      session.access_token,
      session.refresh_token,
      session.expires_in,
      session.expires_at ?? null,
      this.toUser(supabaseUser),
    );
  }

  private toUser(supabaseUser: SupabaseAuthUser): User {
    const metadata = supabaseUser.user_metadata ?? {};
    return new User(
      supabaseUser.id,
      supabaseUser.email ?? '',
      (metadata.full_name as string | undefined) ?? null,
      (metadata.avatar_url as string | undefined) ?? null,
      new Date(supabaseUser.created_at),
      new Date(supabaseUser.updated_at ?? supabaseUser.created_at),
    );
  }
}
