import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Role } from '@gstflow/types';
import type { AppRelease, PaginatedReleases } from '@gstflow/types';
import { createReleaseSchema } from '@gstflow/validation';

import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { AdminService } from './admin.service';
import {
  listReleasesQuerySchema,
  type CreateReleaseInput,
  type ListReleasesQuery,
} from './dto';

@Controller('admin/releases')
@Roles(Role.SUPER_ADMIN)
export class ReleasesController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listReleasesQuerySchema)) query: ListReleasesQuery,
  ): Promise<PaginatedReleases> {
    return this.admin.listReleases(query);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createReleaseSchema)) body: CreateReleaseInput,
    @CurrentUser() actor: Actor,
  ): Promise<AppRelease> {
    return this.admin.createRelease(body, actor);
  }
}
