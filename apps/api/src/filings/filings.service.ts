import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { FilingStatus } from '@gstflow/types';
import type {
  Filing,
  GstReturn,
  Invoice,
  PaginatedFilings,
  PaginatedInvoices,
  PaginatedReturns,
} from '@gstflow/types';

import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../common/auth/actor.types';
import { paginate, parsePagination } from '../common/pagination';
import { serialiseFiling, serialiseInvoice, serialiseReturn } from '../common/serializers';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateFilingInput,
  CreateInvoiceInput,
  CreateReturnInput,
  FilingsQuery,
  InvoicesQuery,
  ReturnsQuery,
  UpdateFilingStatusInput,
} from './dto';

@Injectable()
export class FilingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listInvoices(actor: Actor, query: InvoicesQuery): Promise<PaginatedInvoices> {
    const slice = parsePagination({ page: query.page, pageSize: query.pageSize });
    const where: Prisma.InvoiceWhereInput = {};
    if (query.clientId) {
      await this.assertClient(actor, query.clientId);
      where.clientId = query.clientId;
    }
    if (actor.firmId) where.client = { is: { firmId: actor.firmId } };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: slice.skip,
        take: slice.take,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginate(rows.map(serialiseInvoice), total, slice);
  }

  async createInvoice(actor: Actor, body: CreateInvoiceInput): Promise<Invoice> {
    const client = await this.assertClient(actor, body.clientId);
    const invoice = await this.prisma.invoice.create({
      data: {
        clientId: client.id,
        smsMessageId: body.smsMessageId ?? null,
        invoiceNo: body.invoiceNo ?? null,
        invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : null,
        counterpartyGstin: body.counterpartyGstin ?? null,
        taxableValue: body.taxableValue ?? null,
        taxAmount: body.taxAmount ?? null,
        totalAmount: body.totalAmount ?? null,
      },
    });
    await this.audit.recordAs(actor, {
      action: 'invoice.create',
      entity: 'Invoice',
      entityId: invoice.id,
      meta: { clientId: invoice.clientId },
    });
    return serialiseInvoice(invoice);
  }

  async listReturns(actor: Actor, query: ReturnsQuery): Promise<PaginatedReturns> {
    const slice = parsePagination({ page: query.page, pageSize: query.pageSize });
    const where: Prisma.GstReturnWhereInput = {};
    if (query.clientId) {
      await this.assertClient(actor, query.clientId);
      where.clientId = query.clientId;
    }
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (actor.firmId) where.client = { is: { firmId: actor.firmId } };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.gstReturn.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: slice.skip,
        take: slice.take,
      }),
      this.prisma.gstReturn.count({ where }),
    ]);
    return paginate(rows.map(serialiseReturn), total, slice);
  }

  async createReturn(actor: Actor, body: CreateReturnInput): Promise<GstReturn> {
    const client = await this.assertClient(actor, body.clientId);
    const gstReturn = await this.prisma.gstReturn.create({
      data: {
        clientId: client.id,
        type: body.type,
        period: body.period,
        status: body.status ?? FilingStatus.PENDING,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        notes: body.notes ?? null,
      },
    });
    await this.audit.recordAs(actor, {
      action: 'return.create',
      entity: 'GstReturn',
      entityId: gstReturn.id,
      meta: { clientId: gstReturn.clientId, type: gstReturn.type, period: gstReturn.period },
    });
    return serialiseReturn(gstReturn);
  }

  async listFilings(actor: Actor, query: FilingsQuery): Promise<PaginatedFilings> {
    const slice = parsePagination({ page: query.page, pageSize: query.pageSize });
    const where: Prisma.FilingWhereInput = {};
    if (query.clientId) {
      await this.assertClient(actor, query.clientId);
      where.clientId = query.clientId;
    }
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (actor.firmId) where.client = { is: { firmId: actor.firmId } };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.filing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: slice.skip,
        take: slice.take,
      }),
      this.prisma.filing.count({ where }),
    ]);
    return paginate(rows.map(serialiseFiling), total, slice);
  }

  async createFiling(actor: Actor, body: CreateFilingInput): Promise<Filing> {
    const client = await this.assertClient(actor, body.clientId);
    if (body.returnId) {
      const linked = await this.prisma.gstReturn.findFirst({
        where: { id: body.returnId, clientId: client.id },
        select: { id: true },
      });
      if (!linked) throw new NotFoundException('Return not found');
    }

    const status = body.status ?? FilingStatus.PENDING;
    const filed = status === FilingStatus.FILED;
    const filing = await this.prisma.filing.create({
      data: {
        clientId: client.id,
        returnId: body.returnId ?? null,
        type: body.type,
        period: body.period,
        status,
        referenceNo: body.referenceNo ?? null,
        notes: body.notes ?? null,
        ...(filed ? { filedAt: new Date(), filedById: actor.userId } : {}),
      },
    });
    await this.audit.recordAs(actor, {
      action: 'filing.create',
      entity: 'Filing',
      entityId: filing.id,
      meta: { clientId: filing.clientId, returnId: filing.returnId, status: filing.status },
    });
    return serialiseFiling(filing);
  }

  async updateFilingStatus(
    actor: Actor,
    id: string,
    body: UpdateFilingStatusInput,
  ): Promise<Filing> {
    const filing = await this.prisma.filing.findFirst({
      where: {
        id,
        ...(actor.firmId ? { client: { is: { firmId: actor.firmId } } } : {}),
      },
    });
    if (!filing) throw new NotFoundException('Filing not found');

    const filed = body.status === FilingStatus.FILED;
    const updated = await this.prisma.filing.update({
      where: { id: filing.id },
      data: {
        status: body.status,
        ...(body.referenceNo !== undefined ? { referenceNo: body.referenceNo } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(filed ? { filedAt: new Date(), filedById: actor.userId } : {}),
      },
    });

    if (filed && filing.returnId) {
      await this.prisma.gstReturn.update({
        where: { id: filing.returnId },
        data: {
          status: FilingStatus.FILED,
          filedAt: new Date(),
          filedById: actor.userId,
          referenceNo: body.referenceNo ?? filing.referenceNo ?? null,
        },
      });
    }

    await this.audit.recordAs(actor, {
      action: 'filing.status',
      entity: 'Filing',
      entityId: updated.id,
      meta: { status: updated.status, returnId: updated.returnId },
    });
    return serialiseFiling(updated);
  }

  private async assertClient(actor: Actor, clientId: string): Promise<{ id: string }> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, ...(actor.firmId ? { firmId: actor.firmId } : {}) },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }
}
