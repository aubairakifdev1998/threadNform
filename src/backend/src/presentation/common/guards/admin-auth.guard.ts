import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { Request } from 'express';
import { GetCurrentUserUseCase } from '../../../application/use-cases/auth/get-current-user.use-case.js';
import type { AdminRole } from '../../../domain/auth/permissions.js';
import type { User } from '../../../domain/entities/user.entity.js';
import { ForbiddenException } from '../../../domain/exceptions/domain.exception.js';
import {
  ADMIN_USER_REPOSITORY,
  type AdminUserRepository,
} from '../../../domain/repositories/admin-user.repository.js';

export type AdminAuthenticatedRequest = Request & {
  user?: User;
  accessToken?: string;
  adminUser?: {
    id: string;
    email: string;
    role: AdminRole;
    fullName: string | null;
  };
};

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly getCurrentUser: GetCurrentUserUseCase,
    @Inject(ADMIN_USER_REPOSITORY)
    private readonly adminUsers: AdminUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminAuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const accessToken = header.slice('Bearer '.length).trim();
    const user = await this.getCurrentUser.execute(accessToken);
    const admin = await this.adminUsers.findById(user.id);

    if (!admin || admin.status !== 'ACTIVE') {
      throw new ForbiddenException('Admin access required');
    }

    request.user = user;
    request.accessToken = accessToken;
    request.adminUser = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      fullName: admin.fullName,
    };
    return true;
  }
}
