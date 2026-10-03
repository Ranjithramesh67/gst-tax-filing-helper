import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { createInvoiceSchema } from '@gstflow/validation';
import type { Invoice, PaginatedInvoices } from '@gstflow/types';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { type Actor } from '../common/auth/actor.types';
import { FilingsService } from './filings.service';
import { invoicesQuerySchema, type CreateInvoiceInput, type InvoicesQuery } from './dto';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly filings: FilingsService) {}

  @Get()
  @RequirePermissions('invoices:read')
  async list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(invoicesQuerySchema)) query: InvoicesQuery,
  ): Promise<PaginatedInvoices> {
    return this.filings.listInvoices(actor, query);
  }

  @Post()
  @RequirePermissions('invoices:write')
  async create(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(createInvoiceSchema)) body: CreateInvoiceInput,
  ): Promise<Invoice> {
    return this.filings.createInvoice(actor, body);
  }
}
