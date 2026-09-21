import type { User } from './user.entity.js';

export class AuthSession {
  constructor(
    public readonly accessToken: string,
    public readonly refreshToken: string,
    public readonly expiresIn: number,
    public readonly expiresAt: number | null,
    public readonly user: User,
  ) {}
}
