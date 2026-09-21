import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { GetCurrentUserUseCase } from '../../../application/use-cases/auth/get-current-user.use-case.js';
import type { User } from '../../../domain/entities/user.entity.js';

export type AuthenticatedRequest = Request & {
  user?: User;
  accessToken?: string;
};

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly getCurrentUser: GetCurrentUserUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const accessToken = header.slice('Bearer '.length).trim();
    if (!accessToken) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const user = await this.getCurrentUser.execute(accessToken);
    request.user = user;
    request.accessToken = accessToken;
    return true;
  }
}
