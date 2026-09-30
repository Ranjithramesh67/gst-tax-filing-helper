import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@gstflow/types';
import type { PaginatedUsers, User } from '@gstflow/types';
import { createUserSchema, updateUserSchema } from '@gstflow/validation';

import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { AdminService } from './admin.service';
import {
  listUsersQuerySchema,
  type CreateUserInput,
  type ListUsersQuery,
  type UpdateUserInput,
} from './dto';

@Controller('admin/users')
@Roles(Role.SUPER_ADMIN)
export class UsersController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<PaginatedUsers> {
    return this.admin.listUsers(query);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
    @CurrentUser() actor: Actor,
  ): Promise<User> {
    return this.admin.createUser(body, actor);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
    @CurrentUser() actor: Actor,
  ): Promise<User> {
    return this.admin.updateUser(id, body, actor);
  }
}
