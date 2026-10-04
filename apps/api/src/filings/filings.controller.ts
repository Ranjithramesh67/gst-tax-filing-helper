import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { createFilingSchema, updateFilingSchema, updateFilingStatusSchema } from '@gstflow/validation';
import type { Filing, FilingStatusEvent, PaginatedFilings } from '@gstflow/types';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { type Actor } from '../common/auth/actor.types';
import { FilingsService } from './filings.service';
import {
  filingsQuerySchema,
  type CreateFilingInput,
  type FilingsQuery,
  type UpdateFilingInput,
  type UpdateFilingStatusInput,
} from './dto';

@Controller('filings')
export class FilingsController {
  constructor(private readonly filings: FilingsService) {}

  @Get()
  @RequirePermissions('filings:read')
  async list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(filingsQuerySchema)) query: FilingsQuery,
  ): Promise<PaginatedFilings> {
    return this.filings.listFilings(actor, query);
  }

  @Post()
  @RequirePermissions('filings:write')
  async create(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(createFilingSchema)) body: CreateFilingInput,
  ): Promise<Filing> {
    return this.filings.createFiling(actor, body);
  }

  @Get(':id/history')
  @RequirePermissions('filings:read')
  async history(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
  ): Promise<FilingStatusEvent[]> {
    return this.filings.listFilingHistory(actor, id);
  }

  @Patch(':id/status')
  @RequirePermissions('filings:write')
  async updateStatus(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateFilingStatusSchema)) body: UpdateFilingStatusInput,
  ): Promise<Filing> {
    return this.filings.updateFilingStatus(actor, id, body);
  }

  @Patch(':id')
  @RequirePermissions('filings:write')
  async update(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateFilingSchema)) body: UpdateFilingInput,
  ): Promise<Filing> {
    return this.filings.updateFiling(actor, id, body);
  }
}
