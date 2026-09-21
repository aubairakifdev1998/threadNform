import type { AuthSession } from '../entities/auth-session.entity.js';
import type { User } from '../entities/user.entity.js';

export type SignUpInput = {
  email: string;
  password: string;
  fullName?: string;
  emailRedirectTo?: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

export type SignUpResult =
  | { status: 'authenticated'; session: AuthSession }
  | {
      status: 'confirmation_required';
      email: string;
      message: string;
    };

export interface AuthRepository {
  signUp(input: SignUpInput): Promise<SignUpResult>;
  signIn(input: SignInInput): Promise<AuthSession>;
  signOut(accessToken: string): Promise<void>;
  getUserFromToken(accessToken: string): Promise<User>;
  refreshSession(refreshToken: string): Promise<AuthSession>;
  getGoogleOAuthUrl(redirectTo: string): Promise<{ url: string }>;
  exchangeOAuthCode(code: string): Promise<AuthSession>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(accessToken: string, newPassword: string): Promise<void>;
}

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');
