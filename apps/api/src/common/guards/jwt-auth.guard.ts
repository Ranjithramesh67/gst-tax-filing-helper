import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Role } from '@gstflow/types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { toSystemRole, type Actor } from '../auth/actor.types';

interface AccessTokenPayload {
  sub: string;
  role: Role;
  firmId?: string | null;
  clientId?: string | null;
  email?: string;
  name?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: Actor }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Client portal actors are synthetic (no User row); they carry no RBAC.
    if (payload.role === Role.CLIENT || payload.clientId) {
      request.user = {
        userId: payload.sub,
        role: Role.CLIENT,
        roleId: null,
        roleKey: Role.CLIENT,
        roleName: 'Client',
        isSuperAdmin: false,
        permissions: [],
        firmId: payload.firmId ?? null,
        clientId: payload.clientId ?? payload.sub,
        email: payload.email,
        name: payload.name,
      };
      return true;
    }

    // Staff actors: reload role + permissions so edits take effect immediately.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: true } } },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is not active');
    }

    const roleKey = user.role?.key ?? null;
    request.user = {
      userId: user.id,
      role: toSystemRole(roleKey),
      roleId: user.roleId,
      roleKey: roleKey ?? 'NONE',
      roleName: user.role?.name ?? null,
      isSuperAdmin: roleKey === Role.SUPER_ADMIN,
      permissions: user.role?.permissions.map((p) => p.permission) ?? [],
      firmId: user.firmId,
      clientId: null,
      email: user.email,
      name: user.name,
    };
    return true;
  }
}
