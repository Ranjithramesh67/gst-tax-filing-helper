import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { createInvoiceSchema } from '@gstflow/validation';
import type { Invoice, PaginatedInvoices } from '@gstflow/types';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { STAFF_ROLES, type Actor } from '../common/auth/actor.types';
import { FilingsService } from './filings.service';
import { invoicesQuerySchema, type CreateInvoiceInput, type InvoicesQuery } from './dto';

@Controller('invoices')
@Roles(...STAFF_ROLES)
export class InvoicesController {
  constructor(private readonly filings: FilingsService) {}

  @Get()
  async list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(invoicesQuerySchema)) query: InvoicesQuery,
  ): Promise<PaginatedInvoices> {
    return this.filings.listInvoices(actor, query);
  }

  @Post()
  async create(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(createInvoiceSchema)) body: CreateInvoiceInput,
  ): Promise<Invoice> {
    return this.filings.createInvoice(actor, body);
  }
}
