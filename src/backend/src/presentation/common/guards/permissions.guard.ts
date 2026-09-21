import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  hasPermission,
  type AdminRole,
  type Permission,
} from '../../../domain/auth/permissions.js';
import { ForbiddenException } from '../../../domain/exceptions/domain.exception.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      adminUser?: { role: AdminRole };
    }>();
    const role = request.adminUser?.role;
    if (!role || !permissions.every((p) => hasPermission(role, p))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
