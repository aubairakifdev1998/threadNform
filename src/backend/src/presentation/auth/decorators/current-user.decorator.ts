import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { User } from '../../../domain/entities/user.entity.js';
import type { AuthenticatedRequest } from '../guards/supabase-auth.guard.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user as User;
  },
);

export const AccessToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.accessToken as string;
  },
);
