import { Role } from '@gstflow/types';
import type { Actor } from '../common/auth/actor.types';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string;
  role: Role;
  firmId: string | null;
  clientId: string | null;
  email?: string;
  name?: string;
}

export function actorToPayload(actor: Actor): JwtPayload {
  return {
    sub: actor.userId,
    role: actor.role,
    firmId: actor.firmId,
    clientId: actor.clientId,
    email: actor.email,
    name: actor.name,
  };
}
