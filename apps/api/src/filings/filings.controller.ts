import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { createFilingSchema, updateFilingStatusSchema } from '@gstflow/validation';
import type { Filing, PaginatedFilings } from '@gstflow/types';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { STAFF_ROLES, type Actor } from '../common/auth/actor.types';
import { FilingsService } from './filings.service';
import {
  filingsQuerySchema,
  type CreateFilingInput,
  type FilingsQuery,
  type UpdateFilingStatusInput,
} from './dto';

@Controller('filings')
@Roles(...STAFF_ROLES)
export class FilingsController {
  constructor(private readonly filings: FilingsService) {}

  @Get()
  async list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(filingsQuerySchema)) query: FilingsQuery,
  ): Promise<PaginatedFilings> {
    return this.filings.listFilings(actor, query);
  }

  @Post()
  async create(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(createFilingSchema)) body: CreateFilingInput,
  ): Promise<Filing> {
    return this.filings.createFiling(actor, body);
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateFilingStatusSchema)) body: UpdateFilingStatusInput,
  ): Promise<Filing> {
    return this.filings.updateFilingStatus(actor, id, body);
  }
}
