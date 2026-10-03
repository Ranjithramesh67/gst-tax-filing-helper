import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const SUPER_ADMIN_KEY = 'superAdminOnly';

/** Requires the actor to hold every listed permission (super admin bypasses). */
export const RequirePermissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Restricts an endpoint to the SUPER_ADMIN system role. */
export const RequireSuperAdmin = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SUPER_ADMIN_KEY, true);
