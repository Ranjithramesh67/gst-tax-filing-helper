import type { RawBodyRequest } from '@nestjs/common';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type {
  BillingInvoice,
  Paginated,
  PaymentRequest,
  PublicPaymentRequest,
  Subscription,
} from '@gstflow/types';
import {
  createBillingInvoiceSchema,
  updateBillingInvoiceSchema,
  listBillingInvoicesQuerySchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
  createPaymentRequestSchema,
  listPaymentRequestsQuerySchema,
  paymentMethodSchema,
} from '@gstflow/validation';
import { z } from 'zod';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { STAFF_ROLES, type Actor } from '../common/auth/actor.types';
import { BillingService } from './billing.service';
import type {
  CreateBillingInvoiceInput,
  CreatePaymentRequestInput,
  CreateSubscriptionInput,
  ListBillingInvoicesQuery,
  ListPaymentRequestsQuery,
  UpdateBillingInvoiceInput,
  UpdateSubscriptionInput,
} from './dto';

const markPaidSchema = z.object({
  method: paymentMethodSchema.optional(),
  reference: z.string().trim().max(200).optional(),
  providerRef: z.string().trim().max(200).optional(),
});
type MarkPaidInput = z.infer<typeof markPaidSchema>;

@Controller('billing')
@Roles(...STAFF_ROLES)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('invoices')
  async createInvoice(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(createBillingInvoiceSchema)) body: CreateBillingInvoiceInput,
  ): Promise<BillingInvoice> {
    return this.billing.createInvoice(actor, body);
  }

  @Get('invoices')
  async listInvoices(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(listBillingInvoicesQuerySchema)) query: ListBillingInvoicesQuery,
  ): Promise<Paginated<BillingInvoice>> {
    return this.billing.listInvoices(actor, query);
  }

  @Get('invoices/:id')
  async getInvoice(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
  ): Promise<BillingInvoice> {
    return this.billing.getInvoice(actor, id);
  }

  @Patch('invoices/:id')
  async updateInvoice(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBillingInvoiceSchema)) body: UpdateBillingInvoiceInput,
  ): Promise<BillingInvoice> {
    return this.billing.updateInvoice(actor, id, body);
  }

  @Post('subscriptions')
  async createSubscription(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(createSubscriptionSchema)) body: CreateSubscriptionInput,
  ): Promise<Subscription> {
    return this.billing.createSubscription(actor, body);
  }

  @Get('subscriptions')
  async listSubscriptions(
    @CurrentUser() actor: Actor,
    @Query('clientId') clientId?: string,
  ): Promise<Subscription[]> {
    return this.billing.listSubscriptions(actor, clientId);
  }

  @Patch('subscriptions/:id')
  async updateSubscription(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSubscriptionSchema)) body: UpdateSubscriptionInput,
  ): Promise<Subscription> {
    return this.billing.updateSubscription(actor, id, body);
  }

  @Delete('subscriptions/:id')
  async removeSubscription(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.billing.removeSubscription(actor, id);
  }

  @Post('payment-requests')
  async createPaymentRequest(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(createPaymentRequestSchema)) body: CreatePaymentRequestInput,
  ): Promise<PaymentRequest> {
    return this.billing.createPaymentRequest(actor, body);
  }

  @Get('payment-requests')
  async listPaymentRequests(
    @CurrentUser() actor: Actor,
    @Query(new ZodValidationPipe(listPaymentRequestsQuerySchema)) query: ListPaymentRequestsQuery,
  ): Promise<PaymentRequest[]> {
    return this.billing.listPaymentRequests(actor, query);
  }

  @Delete('payment-requests/:id')
  async removePaymentRequest(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.billing.removePaymentRequest(actor, id);
  }

  @Post('payment-requests/:id/mark-paid')
  async markPaymentRequestPaid(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(markPaidSchema)) body: MarkPaidInput,
  ): Promise<PaymentRequest> {
    return this.billing.markPaymentRequestPaid(id, body);
  }
}

@Controller('public')
export class PublicBillingController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get('payment-requests/:id')
  async getPaymentRequest(@Param('id') id: string): Promise<PublicPaymentRequest> {
    return this.billing.getPublicPaymentRequest(id);
  }

  @Public()
  @Post('cashfree/webhook')
  async cashfreeWebhook(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ success: boolean }> {
    const raw = req.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(req.body ?? {});
    if (!raw) throw new BadRequestException('Empty webhook payload');
    return this.billing.handleCashfreeWebhook(raw, req.headers);
  }
}
