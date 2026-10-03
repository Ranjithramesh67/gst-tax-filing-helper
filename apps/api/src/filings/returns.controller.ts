import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { createReturnSchema } from '@gstflow/validation';
import type { GstReturn, PaginatedReturns } from '@gstflow/types';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { type Actor } from '../common/auth/actor.types';
import { FilingsService } from './filings.service';
import { returnsQuerySchema, type CreateReturnInput, type ReturnsQuery } from './dto';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly filings: FilingsService) {}

  @Get()
  @RequirePermissions('returns:read')
  async list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(returnsQuerySchema)) query: ReturnsQuery,
  ): Promise<PaginatedReturns> {
    return this.filings.listReturns(actor, query);
  }

  @Post()
  @RequirePermissions('returns:write')
  async create(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(createReturnSchema)) body: CreateReturnInput,
  ): Promise<GstReturn> {
    return this.filings.createReturn(actor, body);
  }
}
