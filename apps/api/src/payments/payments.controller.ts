import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type {
  FirmBillingSummary,
  PaginatedPayments,
  Payment,
  PaymentLink,
  ReceivablesResponse,
} from '@gstflow/types';
import {
  createPaymentSchema,
  listPaymentsQuerySchema,
  paymentLinkSchema,
  updatePaymentSchema,
} from '@gstflow/validation';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions, RequireSuperAdmin } from '../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { type Actor } from '../common/auth/actor.types';
import { PaymentsService } from './payments.service';
import type {
  CreatePaymentInput,
  ListPaymentsQuery,
  PaymentLinkInput,
  UpdatePaymentInput,
} from './dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions('payments:read')
  async list(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(listPaymentsQuerySchema)) query: ListPaymentsQuery,
  ): Promise<PaginatedPayments> {
    return this.payments.list(actor, query);
  }

  @Get('receivables')
  @RequirePermissions('payments:read')
  async receivables(@CurrentUser() actor: Actor): Promise<ReceivablesResponse> {
    return this.payments.receivables(actor);
  }

  @Patch(':id')
  @RequirePermissions('payments:manage')
  async update(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePaymentSchema)) body: UpdatePaymentInput,
  ): Promise<Payment> {
    return this.payments.update(actor, id, body);
  }

  @Delete(':id')
  @RequirePermissions('payments:manage')
  async remove(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.payments.remove(actor, id);
  }

  @Post(':id/links')
  @RequirePermissions('payments:manage')
  async addLink(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(paymentLinkSchema)) body: PaymentLinkInput,
  ): Promise<PaymentLink> {
    return this.payments.addLink(actor, id, body);
  }

  @Delete(':id/links/:linkId')
  @RequirePermissions('payments:manage')
  async removeLink(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ): Promise<{ success: boolean }> {
    return this.payments.removeLink(actor, id, linkId);
  }
}

@Controller('filings')
export class FilingPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':id/payments')
  @RequirePermissions('payments:read')
  async list(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
  ): Promise<Payment[]> {
    return this.payments.listForFiling(actor, id);
  }

  @Post(':id/payments')
  @RequirePermissions('payments:manage')
  async create(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createPaymentSchema)) body: CreatePaymentInput,
  ): Promise<Payment> {
    return this.payments.createForFiling(actor, id, body);
  }
}

@Controller('admin')
@RequireSuperAdmin()
export class BillingAdminController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('billing')
  async platform(): Promise<FirmBillingSummary[]> {
    return this.payments.platformSummary();
  }

  @Get('firms/:id/billing')
  async firm(@Param('id') id: string): Promise<ReceivablesResponse> {
    return this.payments.firmReceivables(id);
  }
}
