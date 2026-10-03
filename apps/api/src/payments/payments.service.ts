import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PaymentStatus } from '@gstflow/types';
import type {
  ClientReceivable,
  FirmBillingSummary,
  PaginatedPayments,
  Payment,
  PaymentLink,
  ReceivablesResponse,
} from '@gstflow/types';

import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../common/auth/actor.types';
import { paginate, parsePagination } from '../common/pagination';
import { serialisePayment, serialisePaymentLink } from '../common/serializers';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatePaymentInput,
  ListPaymentsQuery,
  PaymentLinkInput,
  UpdatePaymentInput,
} from './dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private firmScope(actor: Actor): Prisma.PaymentWhereInput {
    return actor.firmId ? { firmId: actor.firmId } : {};
  }

  private async assertFiling(
    actor: Actor,
    filingId: string,
  ): Promise<{ id: string; clientId: string; firmId: string }> {
    const filing = await this.prisma.filing.findFirst({
      where: {
        id: filingId,
        ...(actor.firmId ? { client: { is: { firmId: actor.firmId } } } : {}),
      },
      select: { id: true, clientId: true, client: { select: { firmId: true } } },
    });
    if (!filing) throw new NotFoundException('Filing not found');
    return { id: filing.id, clientId: filing.clientId, firmId: filing.client.firmId };
  }

  private async assertPayment(actor: Actor, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, ...this.firmScope(actor) },
      select: { id: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async createForFiling(
    actor: Actor,
    filingId: string,
    body: CreatePaymentInput,
  ): Promise<Payment> {
    const filing = await this.assertFiling(actor, filingId);
    const status = body.status ?? (body.paidAt ? PaymentStatus.COMPLETED : PaymentStatus.PENDING);
    const payment = await this.prisma.payment.create({
      data: {
        firmId: actor.firmId ?? filing.firmId,
        clientId: filing.clientId,
        filingId: filing.id,
        amount: body.amount,
        status,
        method: body.method ?? null,
        paidAt: body.paidAt
          ? new Date(body.paidAt)
          : status === PaymentStatus.COMPLETED
            ? new Date()
            : null,
        reference: body.reference ?? null,
        notes: body.notes ?? null,
      },
      include: { links: true },
    });
    await this.audit.recordAs(actor, {
      action: 'payment.create',
      entity: 'Payment',
      entityId: payment.id,
      meta: { filingId: payment.filingId, amount: payment.amount, status: payment.status },
    });
    return serialisePayment(payment);
  }

  async listForFiling(actor: Actor, filingId: string): Promise<Payment[]> {
    const filing = await this.assertFiling(actor, filingId);
    const rows = await this.prisma.payment.findMany({
      where: { filingId: filing.id },
      include: { links: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(serialisePayment);
  }

  async update(actor: Actor, id: string, body: UpdatePaymentInput): Promise<Payment> {
    await this.assertPayment(actor, id);
    const payment = await this.prisma.payment.update({
      where: { id },
      data: {
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.method !== undefined ? { method: body.method } : {}),
        ...(body.paidAt !== undefined ? { paidAt: new Date(body.paidAt) } : {}),
        ...(body.reference !== undefined ? { reference: body.reference } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
      include: { links: true },
    });
    await this.audit.recordAs(actor, {
      action: 'payment.update',
      entity: 'Payment',
      entityId: payment.id,
      meta: { ...body },
    });
    return serialisePayment(payment);
  }

  async remove(actor: Actor, id: string): Promise<{ success: boolean }> {
    await this.assertPayment(actor, id);
    await this.prisma.payment.delete({ where: { id } });
    await this.audit.recordAs(actor, {
      action: 'payment.delete',
      entity: 'Payment',
      entityId: id,
    });
    return { success: true };
  }

  async addLink(actor: Actor, id: string, body: PaymentLinkInput): Promise<PaymentLink> {
    await this.assertPayment(actor, id);
    const link = await this.prisma.paymentLink.create({
      data: { paymentId: id, label: body.label, url: body.url },
    });
    return serialisePaymentLink(link);
  }

  async removeLink(
    actor: Actor,
    id: string,
    linkId: string,
  ): Promise<{ success: boolean }> {
    await this.assertPayment(actor, id);
    await this.prisma.paymentLink.deleteMany({ where: { id: linkId, paymentId: id } });
    return { success: true };
  }

  async list(actor: Actor, query: ListPaymentsQuery): Promise<PaginatedPayments> {
    const slice = parsePagination({ page: query.page, pageSize: query.pageSize });
    const where: Prisma.PaymentWhereInput = { ...this.firmScope(actor) };
    if (query.clientId) where.clientId = query.clientId;
    if (query.filingId) where.filingId = query.filingId;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.paidAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: { links: true, client: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: slice.skip,
        take: slice.take,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return paginate(rows.map(serialisePayment), total, slice);
  }

  async receivables(actor: Actor): Promise<ReceivablesResponse> {
    const firmId = actor.firmId;
    const billedByClient = await this.prisma.filing.groupBy({
      by: ['clientId'],
      where: {
        feeAmount: { not: null },
        ...(firmId ? { client: { is: { firmId } } } : {}),
      },
      _sum: { feeAmount: true },
      _count: true,
    });
    const paidByClient = await this.prisma.payment.groupBy({
      by: ['clientId'],
      where: {
        status: PaymentStatus.COMPLETED,
        ...(firmId ? { firmId } : {}),
      },
      _sum: { amount: true },
    });
    const paidMap = new Map(paidByClient.map((row) => [row.clientId, row._sum?.amount ?? 0]));

    const clientIds = billedByClient.map((row) => row.clientId);
    const clients = clientIds.length
      ? await this.prisma.client.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(clients.map((c) => [c.id, c.name]));

    const rows: ClientReceivable[] = billedByClient.map((row) => {
      const billed = row._sum?.feeAmount ?? 0;
      const collected = paidMap.get(row.clientId) ?? 0;
      return {
        clientId: row.clientId,
        clientName: nameMap.get(row.clientId) ?? 'Unknown',
        billed,
        collected,
        outstanding: Math.max(0, billed - collected),
        filingsCount: row._count ?? 0,
      };
    });
    rows.sort((a, b) => b.outstanding - a.outstanding);

    return {
      clients: rows,
      billed: rows.reduce((sum, r) => sum + r.billed, 0),
      collected: rows.reduce((sum, r) => sum + r.collected, 0),
      outstanding: rows.reduce((sum, r) => sum + r.outstanding, 0),
    };
  }

  async platformSummary(): Promise<FirmBillingSummary[]> {
    const [billedByClient, paidByClient, clients, firms, filingCounts, paymentCounts] =
      await Promise.all([
        this.prisma.filing.groupBy({
          by: ['clientId'],
          where: { feeAmount: { not: null } },
          _sum: { feeAmount: true },
        }),
        this.prisma.payment.groupBy({
          by: ['clientId'],
          where: { status: PaymentStatus.COMPLETED },
          _sum: { amount: true },
        }),
        this.prisma.client.findMany({ select: { id: true, firmId: true } }),
        this.prisma.firm.findMany({ select: { id: true, name: true, slug: true } }),
        this.prisma.filing.groupBy({ by: ['clientId'], _count: true }),
        this.prisma.payment.groupBy({ by: ['firmId'], _count: true }),
      ]);

    const firmOfClient = new Map(clients.map((c) => [c.id, c.firmId]));
    const paidMap = new Map(paidByClient.map((r) => [r.clientId, r._sum?.amount ?? 0]));

    const summary = new Map<string, FirmBillingSummary>();
    for (const firm of firms) {
      summary.set(firm.id, {
        firmId: firm.id,
        firmName: firm.name,
        slug: firm.slug,
        billed: 0,
        collected: 0,
        outstanding: 0,
        filingsCount: 0,
        paymentsCount: 0,
      });
    }
    for (const row of billedByClient) {
      const firmId = firmOfClient.get(row.clientId);
      if (!firmId) continue;
      const entry = summary.get(firmId);
      if (!entry) continue;
      entry.billed += row._sum?.feeAmount ?? 0;
      entry.collected += paidMap.get(row.clientId) ?? 0;
    }
    for (const row of filingCounts) {
      const firmId = firmOfClient.get(row.clientId);
      const entry = firmId ? summary.get(firmId) : undefined;
      if (entry) entry.filingsCount += row._count ?? 0;
    }
    for (const row of paymentCounts) {
      const entry = summary.get(row.firmId);
      if (entry) entry.paymentsCount += row._count ?? 0;
    }
    for (const entry of summary.values()) {
      entry.outstanding = Math.max(0, entry.billed - entry.collected);
    }
    return [...summary.values()].sort((a, b) => b.outstanding - a.outstanding);
  }

  async firmReceivables(firmId: string): Promise<ReceivablesResponse> {
    const billedByClient = await this.prisma.filing.groupBy({
      by: ['clientId'],
      where: { feeAmount: { not: null }, client: { is: { firmId } } },
      _sum: { feeAmount: true },
      _count: true,
    });
    const paidByClient = await this.prisma.payment.groupBy({
      by: ['clientId'],
      where: { status: PaymentStatus.COMPLETED, firmId },
      _sum: { amount: true },
    });
    const paidMap = new Map(paidByClient.map((row) => [row.clientId, row._sum?.amount ?? 0]));
    const clientIds = billedByClient.map((row) => row.clientId);
    const clients = clientIds.length
      ? await this.prisma.client.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(clients.map((c) => [c.id, c.name]));
    const rows: ClientReceivable[] = billedByClient.map((row) => {
      const billed = row._sum?.feeAmount ?? 0;
      const collected = paidMap.get(row.clientId) ?? 0;
      return {
        clientId: row.clientId,
        clientName: nameMap.get(row.clientId) ?? 'Unknown',
        billed,
        collected,
        outstanding: Math.max(0, billed - collected),
        filingsCount: row._count ?? 0,
      };
    });
    rows.sort((a, b) => b.outstanding - a.outstanding);
    return {
      clients: rows,
      billed: rows.reduce((sum, r) => sum + r.billed, 0),
      collected: rows.reduce((sum, r) => sum + r.collected, 0),
      outstanding: rows.reduce((sum, r) => sum + r.outstanding, 0),
    };
  }
}
