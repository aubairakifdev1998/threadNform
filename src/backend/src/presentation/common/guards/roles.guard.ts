import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AdminRole } from '../../../domain/auth/permissions.js';
import { ForbiddenException } from '../../../domain/exceptions/domain.exception.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      adminUser?: { role: AdminRole };
    }>();
    const role = request.adminUser?.role;
    if (!role || !roles.includes(role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
