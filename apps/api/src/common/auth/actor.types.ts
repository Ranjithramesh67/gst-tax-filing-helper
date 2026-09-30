import { Role } from '@gstflow/types';

export interface Actor {
  userId: string;
  role: Role;
  firmId: string | null;
  clientId: string | null;
  email?: string;
  name?: string;
}

export const CLIENT_SUBJECT_ROLES: Role[] = [Role.CLIENT];
export const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.FIRM_ADMIN, Role.FILER];
