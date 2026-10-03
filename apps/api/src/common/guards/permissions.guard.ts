import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@gstflow/types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY, SUPER_ADMIN_KEY } from '../decorators/permissions.decorator';
import type { Actor } from '../auth/actor.types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const superOnly = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!superOnly && !requiredRoles?.length && !requiredPermissions?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: Actor }>();
    const actor = request.user;
    if (!actor) throw new ForbiddenException('Not authenticated');

    if (superOnly) {
      if (!actor.isSuperAdmin) {
        throw new ForbiddenException('Super admin access required');
      }
      return true;
    }

    // Legacy @Roles metadata is still honoured (used for CLIENT-only endpoints).
    if (requiredRoles?.length && requiredRoles.includes(actor.role)) return true;

    if (
      requiredPermissions?.length &&
      (actor.isSuperAdmin || requiredPermissions.every((p) => actor.permissions.includes(p)))
    ) {
      return true;
    }

    // Nothing matched: if only @Roles was requested, surface a role-style message.
    if (!requiredPermissions?.length && requiredRoles?.length && !superOnly) {
      throw new ForbiddenException(`Requires role: ${requiredRoles.join(', ')}`);
    }

    throw new ForbiddenException(
      requiredPermissions?.length
        ? `Missing permission: ${requiredPermissions.join(', ')}`
        : 'Forbidden',
    );
  }
}
