import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Paginated, PermissionCatalog, RoleDefinition } from '@gstflow/types';
import {
  createRoleSchema,
  listRolesQuerySchema,
  updateRoleSchema,
} from '@gstflow/validation';

import { RequireSuperAdmin } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { RbacService } from './rbac.service';
import type { CreateRoleInput, ListRolesQuery, UpdateRoleInput } from './dto';

@Controller('admin')
@RequireSuperAdmin()
export class AdminRbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('permissions')
  permissions(): PermissionCatalog {
    return { groups: this.rbac.permissionCatalog() };
  }

  @Get('roles')
  list(
    @Query(new ZodValidationPipe(listRolesQuerySchema)) query: ListRolesQuery,
    @CurrentUser() actor: Actor,
  ): Promise<Paginated<RoleDefinition>> {
    return this.rbac.listRoles(query, actor);
  }

  @Post('roles')
  create(
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput,
    @CurrentUser() actor: Actor,
  ): Promise<RoleDefinition> {
    return this.rbac.createRole(body, actor);
  }

  @Get('roles/:id')
  get(@Param('id') id: string, @CurrentUser() actor: Actor): Promise<RoleDefinition> {
    return this.rbac.getRole(id, actor);
  }

  @Patch('roles/:id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
    @CurrentUser() actor: Actor,
  ): Promise<RoleDefinition> {
    return this.rbac.updateRole(id, body, actor);
  }

  @Delete('roles/:id')
  remove(@Param('id') id: string, @CurrentUser() actor: Actor): Promise<{ success: boolean }> {
    return this.rbac.deleteRole(id, actor);
  }
}
