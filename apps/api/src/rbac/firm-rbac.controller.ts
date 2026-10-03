import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { FIRM_PERMISSIONS } from '@gstflow/types';
import type { FirmPermissionsResponse, FirmRolesResponse, Paginated, RoleDefinition, User } from '@gstflow/types';
import {
  createRoleSchema,
  createTeamMemberSchema,
  listTeamQuerySchema,
  updateRoleSchema,
  updateTeamMemberSchema,
} from '@gstflow/validation';

import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { RbacService } from './rbac.service';
import type {
  CreateRoleInput,
  CreateTeamMemberInput,
  ListTeamQuery,
  UpdateRoleInput,
  UpdateTeamMemberInput,
} from './dto';

@Controller('firm')
export class FirmRbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('permissions')
  @RequirePermissions('roles:read')
  permissions(): FirmPermissionsResponse {
    return {
      groups: this.rbac.permissionCatalog(FIRM_PERMISSIONS),
      permissions: FIRM_PERMISSIONS,
    };
  }

  @Get('roles')
  @RequirePermissions('roles:read')
  async roles(@CurrentUser() actor: Actor): Promise<FirmRolesResponse> {
    const roles = await this.rbac.assignableRoles(actor);
    return {
      system: roles.filter((r) => r.scope === 'SYSTEM'),
      firm: roles.filter((r) => r.scope === 'FIRM'),
    };
  }

  @Post('roles')
  @RequirePermissions('roles:manage')
  create(
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput,
    @CurrentUser() actor: Actor,
  ): Promise<RoleDefinition> {
    return this.rbac.createRole(body, actor);
  }

  @Patch('roles/:id')
  @RequirePermissions('roles:manage')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
    @CurrentUser() actor: Actor,
  ): Promise<RoleDefinition> {
    return this.rbac.updateRole(id, body, actor);
  }

  @Delete('roles/:id')
  @RequirePermissions('roles:manage')
  remove(@Param('id') id: string, @CurrentUser() actor: Actor): Promise<{ success: boolean }> {
    return this.rbac.deleteRole(id, actor);
  }

  @Get('users')
  @RequirePermissions('users:read')
  listTeam(
    @Query(new ZodValidationPipe(listTeamQuerySchema)) query: ListTeamQuery,
    @CurrentUser() actor: Actor,
  ): Promise<Paginated<User>> {
    return this.rbac.listTeam(query, actor);
  }

  @Post('users')
  @RequirePermissions('users:manage')
  createTeamMember(
    @Body(new ZodValidationPipe(createTeamMemberSchema)) body: CreateTeamMemberInput,
    @CurrentUser() actor: Actor,
  ): Promise<User> {
    return this.rbac.createTeamMember(body, actor);
  }

  @Patch('users/:id')
  @RequirePermissions('users:manage')
  updateTeamMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTeamMemberSchema)) body: UpdateTeamMemberInput,
    @CurrentUser() actor: Actor,
  ): Promise<User> {
    return this.rbac.updateTeamMember(id, body, actor);
  }
}
