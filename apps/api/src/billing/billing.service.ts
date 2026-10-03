import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PaymentStatus } from '@gstflow/types';
import type {
  BillingInvoice,
  Paginated,
  PaymentRequest,
  PublicPaymentRequest,
  Subscription,
} from '@gstflow/types';

import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../common/auth/actor.types';
import { paginate, parsePagination } from '../common/pagination';
import {
  serialiseBillingInvoice,
  serialisePaymentRequest,
  serialisePublicPaymentRequest,
  serialiseSubscription,
} from '../common/serializers';
import { PrismaService } from '../prisma/prisma.service';
import { CashfreeService } from './cashfree.service';
import type {
  CreateBillingInvoiceInput,
  CreatePaymentRequestInput,
  CreateSubscriptionInput,
  ListBillingInvoicesQuery,
  ListPaymentRequestsQuery,
  UpdateBillingInvoiceInput,
  UpdateSubscriptionInput,
} from './dto';

const CYCLE_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cashfree: CashfreeService,
    private readonly config: ConfigService,
  ) {}

  private firmScope(actor: Actor): { firmId?: string } {
    return actor.firmId ? { firmId: actor.firmId } : {};
  }

  private addCycle(date: Date, cycle: string): Date {
    const months = CYCLE_MONTHS[cycle] ?? 1;
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
  }

  private async nextInvoiceNumber(firmId: string): Promise<string> {
    const count = await this.prisma.billingInvoice.count({ where: { firmId } });
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    return `INV-${stamp}-${String(count + 1).padStart(4, '0')}`;
  }

  private async assertClient(
    actor: Actor,
    clientId: string,
  ): Promise<{ id: string; firmId: string; name: string; phone: string; email: string | null }> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, ...(actor.firmId ? { firmId: actor.firmId } : {}) },
      select: { id: true, firmId: true, name: true, phone: true, email: true },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  private async assertInvoice(actor: Actor, id: string) {
    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { id, ...this.firmScope(actor) },
      select: { id: true, clientId: true, firmId: true, total: true, status: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private async assertSubscription(actor: Actor, id: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id, ...this.firmScope(actor) },
      select: { id: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    return subscription;
  }

  private async paidForInvoices(invoiceIds: string[]): Promise<Map<string, number>> {
    if (!invoiceIds.length) return new Map();
    const rows = await this.prisma.payment.groupBy({
      by: ['invoiceId'],
      where: { invoiceId: { in: invoiceIds }, status: PaymentStatus.COMPLETED },
      _sum: { amount: true },
    });
    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.invoiceId) map.set(row.invoiceId, row._sum?.amount ?? 0);
    }
    return map;
  }

  // ---------------------------------------------------------------------------
  // Invoices
  // ---------------------------------------------------------------------------

  async createInvoice(actor: Actor, body: CreateBillingInvoiceInput): Promise<BillingInvoice> {
    const client = await this.assertClient(actor, body.clientId);
    const firmId = actor.firmId ?? client.firmId;

    for (const item of body.items) {
      if (!item.filingId) continue;
      const filing = await this.prisma.filing.findFirst({
        where: { id: item.filingId, clientId: client.id },
        select: { id: true },
      });
      if (!filing) throw new NotFoundException('Filing not found');
    }

    const subtotal = body.items.reduce((sum, item) => sum + item.amount, 0);
    const number = await this.nextInvoiceNumber(firmId);
    const invoice = await this.prisma.billingInvoice.create({
      data: {
        firmId,
        clientId: client.id,
        number,
        type: body.type ?? 'PER_FILING',
        status: 'DRAFT',
        issueDate: body.issueDate ? new Date(body.issueDate) : new Date(),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        subtotal,
        total: subtotal,
        notes: body.notes ?? null,
        items: {
          create: body.items.map((item) => ({
            filingId: item.filingId ?? null,
            description: item.description,
            amount: item.amount,
          })),
        },
      },
      include: { items: true, client: { select: { id: true, name: true } } },
    });

    await this.audit.recordAs(actor, {
      action: 'billing-invoice.create',
      entity: 'BillingInvoice',
      entityId: invoice.id,
      meta: { number: invoice.number, total: invoice.total, clientId: client.id },
    });
    return serialiseBillingInvoice({ ...invoice, paid: 0 });
  }

  async listInvoices(
    actor: Actor,
    query: ListBillingInvoicesQuery,
  ): Promise<Paginated<BillingInvoice>> {
    const slice = parsePagination({ page: query.page, pageSize: query.pageSize });
    const where: Prisma.BillingInvoiceWhereInput = { ...this.firmScope(actor) };
    if (query.clientId) where.clientId = query.clientId;
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.billingInvoice.findMany({
        where,
        include: {
          items: true,
          client: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: slice.skip,
        take: slice.take,
      }),
      this.prisma.billingInvoice.count({ where }),
    ]);
    const paidMap = await this.paidForInvoices(rows.map((row) => row.id));
    return paginate(
      rows.map((row) => serialiseBillingInvoice({ ...row, paid: paidMap.get(row.id) ?? 0 })),
      total,
      slice,
    );
  }

  async getInvoice(actor: Actor, id: string): Promise<BillingInvoice> {
    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { id, ...this.firmScope(actor) },
      include: { items: true, client: { select: { id: true, name: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const agg = await this.prisma.payment.aggregate({
      where: { invoiceId: id, status: PaymentStatus.COMPLETED },
      _sum: { amount: true },
    });
    return serialiseBillingInvoice({ ...invoice, paid: agg._sum.amount ?? 0 });
  }

  async updateInvoice(
    actor: Actor,
    id: string,
    body: UpdateBillingInvoiceInput,
  ): Promise<BillingInvoice> {
    await this.assertInvoice(actor, id);
    const invoice = await this.prisma.billingInvoice.update({
      where: { id },
      data: {
        ...(body.dueDate !== undefined
          ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
          : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
      include: { items: true, client: { select: { id: true, name: true } } },
    });
    const agg = await this.prisma.payment.aggregate({
      where: { invoiceId: id, status: PaymentStatus.COMPLETED },
      _sum: { amount: true },
    });
    await this.audit.recordAs(actor, {
      action: 'billing-invoice.update',
      entity: 'BillingInvoice',
      entityId: id,
      meta: { ...body },
    });
    return serialiseBillingInvoice({ ...invoice, paid: agg._sum.amount ?? 0 });
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  async createSubscription(
    actor: Actor,
    body: CreateSubscriptionInput,
  ): Promise<Subscription> {
    const client = await this.assertClient(actor, body.clientId);
    const firmId = actor.firmId ?? client.firmId;
    const startDate = body.startDate ? new Date(body.startDate) : new Date();
    const cycle = body.cycle ?? 'MONTHLY';
    const nextDueDate = body.nextDueDate
      ? new Date(body.nextDueDate)
      : this.addCycle(startDate, cycle);

    const subscription = await this.prisma.subscription.create({
      data: {
        firmId,
        clientId: client.id,
        amount: body.amount,
        cycle,
        startDate,
        nextDueDate,
        active: body.active ?? true,
        notes: body.notes ?? null,
      },
      include: { client: { select: { id: true, name: true } } },
    });
    await this.audit.recordAs(actor, {
      action: 'subscription.create',
      entity: 'Subscription',
      entityId: subscription.id,
      meta: { amount: subscription.amount, cycle: subscription.cycle },
    });
    return serialiseSubscription(subscription);
  }

  async listSubscriptions(actor: Actor, clientId?: string): Promise<Subscription[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { ...this.firmScope(actor), ...(clientId ? { clientId } : {}) },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(serialiseSubscription);
  }

  async updateSubscription(
    actor: Actor,
    id: string,
    body: UpdateSubscriptionInput,
  ): Promise<Subscription> {
    const current = await this.prisma.subscription.findUnique({
      where: { id },
      select: { cycle: true, startDate: true, nextDueDate: true },
    });
    await this.assertSubscription(actor, id);
    let nextDueDate: Date | undefined;
    if (body.nextDueDate) {
      nextDueDate = new Date(body.nextDueDate);
    } else if (body.cycle && current) {
      nextDueDate = this.addCycle(current.nextDueDate ?? current.startDate, body.cycle);
    }
    const subscription = await this.prisma.subscription.update({
      where: { id },
      data: {
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.cycle !== undefined ? { cycle: body.cycle } : {}),
        ...(nextDueDate ? { nextDueDate } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
      include: { client: { select: { id: true, name: true } } },
    });
    await this.audit.recordAs(actor, {
      action: 'subscription.update',
      entity: 'Subscription',
      entityId: id,
      meta: { ...body },
    });
    return serialiseSubscription(subscription);
  }

  async removeSubscription(actor: Actor, id: string): Promise<{ success: boolean }> {
    await this.assertSubscription(actor, id);
    await this.prisma.subscription.delete({ where: { id } });
    await this.audit.recordAs(actor, {
      action: 'subscription.delete',
      entity: 'Subscription',
      entityId: id,
    });
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Payment requests
  // ---------------------------------------------------------------------------

  private webBaseUrl(): string {
    return (
      this.config.get<string>('WEB_BASE_URL')?.replace(/\/$/, '') ?? 'http://localhost:3000'
    );
  }

  private apiBaseUrl(): string {
    return (
      this.config.get<string>('API_BASE_URL')?.replace(/\/$/, '') ?? 'http://localhost:4000'
    );
  }

  async createPaymentRequest(
    actor: Actor,
    body: CreatePaymentRequestInput,
  ): Promise<PaymentRequest> {
    let clientId = body.clientId ?? null;
    let invoiceId = body.invoiceId ?? null;
    let filingId = body.filingId ?? null;

    if (invoiceId) {
      const invoice = await this.assertInvoice(actor, invoiceId);
      clientId = invoice.clientId;
    } else if (filingId) {
      const filing = await this.prisma.filing.findFirst({
        where: { id: filingId, ...(actor.firmId ? { client: { is: { firmId: actor.firmId } } } : {}) },
        select: { id: true, clientId: true },
      });
      if (!filing) throw new NotFoundException('Filing not found');
      clientId = filing.clientId;
    }
    if (!clientId) throw new BadRequestException('A client is required');

    const client = await this.assertClient(actor, clientId);
    const firmId = actor.firmId ?? client.firmId;
    const firm = await this.prisma.firm.findUnique({
      where: { id: firmId },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        brandColor: true,
        supportEmail: true,
        supportPhone: true,
      },
    });
    if (!firm) throw new NotFoundException('Firm not found');

    const created = await this.prisma.paymentRequest.create({
      data: {
        firmId,
        clientId: client.id,
        invoiceId,
        filingId,
        amount: body.amount,
        description: body.description ?? null,
        status: 'PENDING',
        provider: 'MANUAL',
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    const returnUrl = `${this.webBaseUrl()}/${firm.slug}/pay/${created.id}`;
    const link = await this.cashfree.createLink({
      linkId: created.id,
      amount: body.amount,
      description: body.description ?? `Payment to ${firm.name}`,
      customerName: client.name,
      customerPhone: client.phone,
      customerEmail: client.email,
      returnUrl,
      notifyUrl: `${this.apiBaseUrl()}/v1/public/cashfree/webhook`,
    });

    const updated = await this.prisma.paymentRequest.update({
      where: { id: created.id },
      data: link
        ? { provider: 'CASHFREE', providerRef: link.providerRef, url: link.url }
        : { provider: 'MANUAL', url: returnUrl },
      include: { client: { select: { id: true, name: true } }, firm: { select: { id: true, name: true, slug: true } } },
    });

    await this.audit.recordAs(actor, {
      action: 'payment-request.create',
      entity: 'PaymentRequest',
      entityId: updated.id,
      meta: { amount: updated.amount, provider: updated.provider, invoiceId, filingId },
    });
    return serialisePaymentRequest(updated);
  }

  async listPaymentRequests(
    actor: Actor,
    query: ListPaymentRequestsQuery,
  ): Promise<PaymentRequest[]> {
    const rows = await this.prisma.paymentRequest.findMany({
      where: {
        ...this.firmScope(actor),
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.invoiceId ? { invoiceId: query.invoiceId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(serialisePaymentRequest);
  }

  async removePaymentRequest(actor: Actor, id: string): Promise<{ success: boolean }> {
    const request = await this.prisma.paymentRequest.findFirst({
      where: { id, ...this.firmScope(actor) },
      select: { id: true, status: true },
    });
    if (!request) throw new NotFoundException('Payment request not found');
    if (request.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('Completed requests cannot be removed');
    }
    await this.prisma.paymentRequest.delete({ where: { id } });
    await this.audit.recordAs(actor, {
      action: 'payment-request.delete',
      entity: 'PaymentRequest',
      entityId: id,
    });
    return { success: true };
  }

  async getPublicPaymentRequest(id: string): Promise<PublicPaymentRequest> {
    const request = await this.prisma.paymentRequest.findUnique({
      where: { id },
      include: {
        client: { select: { name: true } },
        invoice: { select: { number: true } },
        firm: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            brandColor: true,
            supportEmail: true,
            supportPhone: true,
          },
        },
      },
    });
    if (!request) throw new NotFoundException('Payment request not found');
    return serialisePublicPaymentRequest(request);
  }

  private async recomputeInvoiceStatus(
    tx: Prisma.TransactionClient,
    invoiceId: string,
  ): Promise<void> {
    const invoice = await tx.billingInvoice.findUnique({
      where: { id: invoiceId },
      select: { total: true, status: true },
    });
    if (!invoice || invoice.status === 'VOID' || invoice.status === 'DRAFT') return;
    const agg = await tx.payment.aggregate({
      where: { invoiceId, status: PaymentStatus.COMPLETED },
      _sum: { amount: true },
    });
    const paid = agg._sum.amount ?? 0;
    const status =
      invoice.total > 0 && paid >= invoice.total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'ISSUED';
    await tx.billingInvoice.update({ where: { id: invoiceId }, data: { status } });
  }

  async markPaymentRequestPaid(
    id: string,
    options: { method?: string; reference?: string; providerRef?: string } = {},
  ): Promise<PaymentRequest> {
    await this.prisma.$transaction(async (tx) => {
      const request = await tx.paymentRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException('Payment request not found');
      if (request.status === PaymentStatus.COMPLETED) return;

      await tx.paymentRequest.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          paidAt: new Date(),
          ...(options.providerRef ? { providerRef: options.providerRef } : {}),
        },
      });
      await tx.payment.create({
        data: {
          firmId: request.firmId,
          clientId: request.clientId,
          filingId: request.filingId,
          invoiceId: request.invoiceId,
          amount: request.amount,
          status: 'COMPLETED',
          method: options.method ? (options.method as PaymentMethod) : PaymentMethod.UPI,
          paidAt: new Date(),
          reference: options.reference ?? `Payment request ${id}`,
        },
      });
      if (request.invoiceId) {
        await this.recomputeInvoiceStatus(tx, request.invoiceId);
      }
    });

    const fresh = await this.prisma.paymentRequest.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        firm: { select: { id: true, name: true, slug: true } },
      },
    });
    return serialisePaymentRequest(fresh!);
  }

  async handleCashfreeWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ success: boolean }> {
    const signature = String(headers['x-webhook-signature'] ?? '');
    const timestamp = String(headers['x-webhook-timestamp'] ?? '');
    if (this.cashfree.isConfigured()) {
      const valid = this.cashfree.verifyWebhook(rawBody, timestamp, signature);
      if (!valid) throw new BadRequestException('Invalid webhook signature');
    } else {
      this.logger.warn('Cashfree webhook received but Cashfree is not configured');
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid webhook payload');
    }
    const data = (event.data as Record<string, unknown>) ?? {};
    const order = (data.order as Record<string, unknown>) ?? {};
    const linkId =
      (data.link_id as string) ??
      (data.cf_link_id as string) ??
      (order.order_id as string) ??
      '';
    const status = String(data.link_status ?? data.payment_status ?? event.type ?? '');

    const request = await this.prisma.paymentRequest.findFirst({
      where: { OR: [{ id: linkId }, { providerRef: linkId }] },
      select: { id: true, status: true },
    });
    if (!request) return { success: false };

    const isPaid = status.toUpperCase().includes('PAID') || status.toUpperCase().includes('SUCCESS');
    if (isPaid && request.status !== PaymentStatus.COMPLETED) {
      await this.markPaymentRequestPaid(request.id, {
        method: 'UPI',
        reference: linkId,
        providerRef: linkId,
      });
    }
    return { success: true };
  }
}
