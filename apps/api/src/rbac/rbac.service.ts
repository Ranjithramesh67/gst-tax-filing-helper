import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PERMISSION_DEFS,
  RoleScope,
  isPermissionKey,
  isPlatformPermission,
} from '@gstflow/types';
import type { Paginated, PermissionGroup, RoleDefinition, User } from '@gstflow/types';
import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { paginate, parsePagination } from '../common/pagination';
import { serialiseRole, serialiseUser } from '../common/serializers';
import type { Actor } from '../common/auth/actor.types';
import type {
  CreateRoleInput,
  CreateTeamMemberInput,
  ListRolesQuery,
  ListTeamQuery,
  UpdateRoleInput,
  UpdateTeamMemberInput,
} from './dto';

const ROLE_INCLUDE = {
  permissions: true,
  _count: { select: { users: true } },
  firm: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.RoleInclude;

const TEAM_INCLUDE = {
  role: { select: { key: true, name: true } },
  firm: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.UserInclude;

const FIRM_ASSIGNABLE_SYSTEM_ROLES = ['FIRM_ADMIN', 'FILER'];

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  permissionCatalog(allowed?: readonly string[]): PermissionGroup[] {
    const groups = new Map<string, PermissionGroup['permissions']>();
    for (const def of PERMISSION_DEFS) {
      if (allowed && !allowed.includes(def.key)) continue;
      const list = groups.get(def.group) ?? [];
      list.push({ key: def.key, label: def.label, platform: Boolean(def.platform) });
      groups.set(def.group, list);
    }
    return [...groups.entries()].map(([group, permissions]) => ({ group, permissions }));
  }

  private validatePermissions(keys: string[], firmScoped: boolean): string[] {
    const unique = [...new Set(keys)];
    for (const key of unique) {
      if (!isPermissionKey(key)) throw new BadRequestException(`Unknown permission: ${key}`);
      if (firmScoped && isPlatformPermission(key)) {
        throw new BadRequestException(`"${key}" cannot be granted to a firm role`);
      }
    }
    return unique;
  }

  private async requireFirm(firmId: string): Promise<void> {
    const firm = await this.prisma.firm.findUnique({ where: { id: firmId }, select: { id: true } });
    if (!firm) throw new NotFoundException('Firm not found');
  }

  private assertCanManageRole(role: { firmId: string | null; isSystem: boolean }, actor: Actor): void {
    if (actor.isSuperAdmin) return;
    if (role.isSystem) throw new ForbiddenException('System roles are managed by the platform admin');
    if (role.firmId !== actor.firmId) throw new NotFoundException('Role not found');
  }

  async listRoles(query: ListRolesQuery, actor: Actor): Promise<Paginated<RoleDefinition>> {
    const slice = parsePagination(query);
    const and: Prisma.RoleWhereInput[] = [];
    if (query.search) {
      and.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { key: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (actor.isSuperAdmin) {
      if (query.scope) and.push({ scope: query.scope });
      if (query.firmId) and.push({ firmId: query.firmId });
    } else {
      and.push({ OR: [{ scope: RoleScope.SYSTEM }, { firmId: actor.firmId ?? '__none__' }] });
    }
    const where: Prisma.RoleWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        include: ROLE_INCLUDE,
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
        skip: slice.skip,
        take: slice.take,
      }),
      this.prisma.role.count({ where }),
    ]);
    return paginate(rows.map((row) => serialiseRole(row)), total, slice);
  }

  async getRole(id: string, actor: Actor): Promise<RoleDefinition> {
    const role = await this.prisma.role.findUnique({ where: { id }, include: ROLE_INCLUDE });
    if (!role) throw new NotFoundException('Role not found');
    if (!actor.isSuperAdmin && role.firmId !== actor.firmId) {
      throw new NotFoundException('Role not found');
    }
    return serialiseRole(role);
  }

  async createRole(input: CreateRoleInput, actor: Actor): Promise<RoleDefinition> {
    let scope: RoleScope;
    let firmId: string | null;

    if (actor.isSuperAdmin) {
      if (input.firmId) {
        await this.requireFirm(input.firmId);
        scope = RoleScope.FIRM;
        firmId = input.firmId;
      } else {
        scope = (input.scope as RoleScope | undefined) ?? RoleScope.SYSTEM;
        firmId = scope === RoleScope.SYSTEM ? null : actor.firmId;
      }
    } else {
      if (!actor.firmId) throw new ForbiddenException('No firm context for this account');
      scope = RoleScope.FIRM;
      firmId = actor.firmId;
    }

    if (scope === RoleScope.FIRM && !firmId) {
      throw new BadRequestException('A firm role requires a firmId');
    }

    const permissions = this.validatePermissions(input.permissions, scope === RoleScope.FIRM);

    const existing = await this.prisma.role.findFirst({
      where: { key: input.key, firmId: scope === RoleScope.SYSTEM ? null : firmId },
      select: { id: true },
    });
    if (existing) throw new ConflictException('A role with this key already exists');

    const role = await this.prisma.role.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        scope,
        firmId,
        isSystem: false,
        permissions: { create: permissions.map((permission) => ({ permission })) },
      },
      include: ROLE_INCLUDE,
    });

    await this.audit.recordAs(actor, {
      action: 'role.create',
      entity: 'Role',
      entityId: role.id,
      meta: { key: role.key, scope: role.scope, firmId: role.firmId, permissions },
    });
    return serialiseRole(role);
  }

  async updateRole(id: string, input: UpdateRoleInput, actor: Actor): Promise<RoleDefinition> {
    const existing = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: true, _count: { select: { users: true } } },
    });
    if (!existing) throw new NotFoundException('Role not found');
    this.assertCanManageRole(existing, actor);

    const isFirmScoped = existing.scope === RoleScope.FIRM;
    const permissions =
      input.permissions !== undefined
        ? this.validatePermissions(input.permissions, isFirmScoped)
        : undefined;

    const role = await this.prisma.role.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(permissions !== undefined
          ? {
              permissions: {
                deleteMany: {},
                create: permissions.map((permission) => ({ permission })),
              },
            }
          : {}),
      },
      include: ROLE_INCLUDE,
    });

    await this.audit.recordAs(actor, {
      action: 'role.update',
      entity: 'Role',
      entityId: role.id,
      meta: {
        key: role.key,
        ...(permissions !== undefined
          ? {
              permissionsFrom: existing.permissions.map((p) => p.permission),
              permissionsTo: permissions,
            }
          : {}),
      },
    });
    return serialiseRole(role);
  }

  async deleteRole(id: string, actor: Actor): Promise<{ success: boolean }> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    this.assertCanManageRole(role, actor);
    if (role._count.users > 0) {
      throw new ConflictException('Reassign the users on this role before deleting it');
    }

    await this.prisma.role.delete({ where: { id } });
    await this.audit.recordAs(actor, {
      action: 'role.delete',
      entity: 'Role',
      entityId: id,
      meta: { key: role.key },
    });
    return { success: true };
  }

  // --- firm team + assignable roles ---

  async assignableRoles(actor: Actor): Promise<RoleDefinition[]> {
    if (!actor.firmId && !actor.isSuperAdmin) {
      throw new ForbiddenException('No firm context for this account');
    }
    const firmId = actor.firmId ?? '__none__';
    const rows = await this.prisma.role.findMany({
      where: {
        OR: [
          { firmId: null, key: { in: FIRM_ASSIGNABLE_SYSTEM_ROLES } },
          { firmId },
        ],
      },
      include: ROLE_INCLUDE,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return rows.map((row) => serialiseRole(row));
  }

  async listTeam(query: ListTeamQuery, actor: Actor): Promise<Paginated<User>> {
    if (!actor.firmId) throw new ForbiddenException('No firm context for this account');
    const slice = parsePagination(query);
    const and: Prisma.UserWhereInput[] = [{ firmId: actor.firmId }];
    if (query.search) {
      and.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.UserWhereInput = { AND: and };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: TEAM_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: slice.skip,
        take: slice.take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(rows.map((row) => serialiseUser(row)), total, slice);
  }

  private async resolveAssignableRoleId(
    roleId: string | undefined,
    roleKey: string | undefined,
    actor: Actor,
  ): Promise<string> {
    if (roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: roleId } });
      if (!role) throw new NotFoundException('Role not found');
      if (role.scope === RoleScope.SYSTEM) {
        if (!FIRM_ASSIGNABLE_SYSTEM_ROLES.includes(role.key)) {
          throw new BadRequestException('This role is not assignable');
        }
      } else if (role.firmId !== actor.firmId) {
        throw new NotFoundException('Role not found');
      }
      return role.id;
    }
    if (roleKey) {
      if (!FIRM_ASSIGNABLE_SYSTEM_ROLES.includes(roleKey)) {
        throw new BadRequestException('This role is not assignable');
      }
      const role = await this.prisma.role.findFirst({ where: { key: roleKey, firmId: null } });
      if (!role) throw new NotFoundException('Role not found');
      return role.id;
    }
    const fallback = await this.prisma.role.findFirst({ where: { key: 'FILER', firmId: null } });
    if (!fallback) throw new BadRequestException('Default role is not configured');
    return fallback.id;
  }

  async createTeamMember(input: CreateTeamMemberInput, actor: Actor): Promise<User> {
    if (!actor.firmId) throw new ForbiddenException('No firm context for this account');
    const roleId = await this.resolveAssignableRoleId(input.roleId, input.role, actor);
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user
      .create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          roleId,
          firmId: actor.firmId,
          passwordHash,
        },
        include: TEAM_INCLUDE,
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('A user with this email already exists');
        }
        throw error;
      });
    await this.audit.recordAs(actor, {
      action: 'team.create',
      entity: 'User',
      entityId: user.id,
      meta: { email: user.email, role: user.role?.key ?? null },
    });
    return serialiseUser(user);
  }

  async updateTeamMember(id: string, input: UpdateTeamMemberInput, actor: Actor): Promise<User> {
    if (!actor.firmId) throw new ForbiddenException('No firm context for this account');
    const existing = await this.prisma.user.findUnique({ where: { id }, select: { id: true, firmId: true } });
    if (!existing || existing.firmId !== actor.firmId) throw new NotFoundException('User not found');

    const roleChanged = input.roleId !== undefined || input.role !== undefined;
    const roleId = roleChanged
      ? await this.resolveAssignableRoleId(input.roleId, input.role, actor)
      : undefined;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(roleId !== undefined ? { roleId } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: TEAM_INCLUDE,
    });
    await this.audit.recordAs(actor, {
      action: 'team.update',
      entity: 'User',
      entityId: user.id,
      meta: { ...input },
    });
    return serialiseUser(user);
  }
}
