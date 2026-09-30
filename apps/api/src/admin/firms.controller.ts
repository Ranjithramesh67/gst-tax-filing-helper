import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@gstflow/types';
import type { Firm, PaginatedFirms } from '@gstflow/types';
import { createFirmSchema, updateFirmSchema } from '@gstflow/validation';

import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { AdminService } from './admin.service';
import {
  listFirmsQuerySchema,
  type CreateFirmInput,
  type ListFirmsQuery,
  type UpdateFirmInput,
} from './dto';

@Controller('admin/firms')
@Roles(Role.SUPER_ADMIN)
export class FirmsController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listFirmsQuerySchema)) query: ListFirmsQuery,
  ): Promise<PaginatedFirms> {
    return this.admin.listFirms(query);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createFirmSchema)) body: CreateFirmInput,
    @CurrentUser() actor: Actor,
  ): Promise<Firm> {
    return this.admin.createFirm(body, actor);
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<Firm> {
    return this.admin.getFirm(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateFirmSchema)) body: UpdateFirmInput,
    @CurrentUser() actor: Actor,
  ): Promise<Firm> {
    return this.admin.updateFirm(id, body, actor);
  }
}
