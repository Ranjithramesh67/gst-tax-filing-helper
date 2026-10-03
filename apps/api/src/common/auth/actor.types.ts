import { Role } from '@gstflow/types';

export interface Actor {
  userId: string;
  /** Mapped system role — used for coarse checks (CLIENT detection, super-admin bypass). */
  role: Role;
  roleId: string | null;
  /** Actual role key, including custom firm roles. */
  roleKey: string;
  roleName: string | null;
  isSuperAdmin: boolean;
  /** Resolved permission keys for the actor's role. */
  permissions: string[];
  firmId: string | null;
  clientId: string | null;
  email?: string;
  name?: string;
}

export const CLIENT_SUBJECT_ROLES: Role[] = [Role.CLIENT];
export const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.FIRM_ADMIN, Role.FILER];

/** Maps a role key (system or custom) onto the coarse system Role enum. */
export function toSystemRole(roleKey?: string | null): Role {
  switch (roleKey) {
    case Role.SUPER_ADMIN:
      return Role.SUPER_ADMIN;
    case Role.FIRM_ADMIN:
      return Role.FIRM_ADMIN;
    case Role.FILER:
      return Role.FILER;
    case Role.CLIENT:
      return Role.CLIENT;
    default:
      return Role.FILER;
  }
}

export function isClientActor(actor: Actor): boolean {
  return actor.role === Role.CLIENT || actor.clientId != null;
}
