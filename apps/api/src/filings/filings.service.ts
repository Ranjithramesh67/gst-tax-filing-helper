import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { FilingEventSource, FilingStatus } from '@gstflow/types';
import type {
  Filing,
  FilingStatusEvent,
  GstReturn,
  Invoice,
  PaginatedFilings,
  PaginatedInvoices,
  PaginatedReturns,
  ReturnType,
} from '@gstflow/types';

import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../common/auth/actor.types';
import { paginate, parsePagination } from '../common/pagination';
import {
  serialiseFiling,
  serialiseFilingEvent,
  serialiseInvoice,
  serialiseReturn,
} from '../common/serializers';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateFilingInput,
  CreateInvoiceInput,
  CreateReturnInput,
  FilingsQuery,
  InvoicesQuery,
  ReturnsQuery,
  UpdateFilingInput,
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
        include: { payments: { select: { amount: true, status: true } } },
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
        feeAmount: body.feeAmount ?? null,
        referenceNo: body.referenceNo ?? null,
        notes: body.notes ?? null,
        ...(filed ? { filedAt: new Date(), filedById: actor.userId } : {}),
      },
      include: { payments: { select: { amount: true, status: true } } },
    });
    await this.audit.recordAs(actor, {
      action: 'filing.create',
      entity: 'Filing',
      entityId: filing.id,
      meta: { clientId: filing.clientId, returnId: filing.returnId, status: filing.status },
    });
    await this.prisma.filingStatusEvent.create({
      data: {
        filingId: filing.id,
        returnId: filing.returnId,
        clientId: filing.clientId,
        status: filing.status,
        source: FilingEventSource.MANUAL,
        actorId: actor.userId,
        actorName: actor.name ?? null,
      },
    });
    return serialiseFiling(filing);
  }

  async updateFiling(actor: Actor, id: string, body: UpdateFilingInput): Promise<Filing> {
    const filing = await this.prisma.filing.findFirst({
      where: { id, ...(actor.firmId ? { client: { is: { firmId: actor.firmId } } } : {}) },
    });
    if (!filing) throw new NotFoundException('Filing not found');

    const updated = await this.prisma.filing.update({
      where: { id: filing.id },
      data: {
        ...(body.feeAmount !== undefined ? { feeAmount: body.feeAmount } : {}),
        ...(body.referenceNo !== undefined ? { referenceNo: body.referenceNo } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
      include: { payments: { select: { amount: true, status: true } } },
    });
    await this.audit.recordAs(actor, {
      action: 'filing.update',
      entity: 'Filing',
      entityId: updated.id,
      meta: { ...body },
    });
    return serialiseFiling(updated);
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
      include: { payments: { select: { amount: true, status: true } } },
    });

    if (updated.status !== filing.status) {
      await this.prisma.filingStatusEvent.create({
        data: {
          filingId: updated.id,
          returnId: updated.returnId,
          clientId: updated.clientId,
          status: updated.status,
          previousStatus: filing.status,
          source: FilingEventSource.MANUAL,
          actorId: actor.userId,
          actorName: actor.name ?? null,
        },
      });
    }

    if (filed && filing.returnId) {
      const linked = await this.prisma.gstReturn.findUnique({
        where: { id: filing.returnId },
        select: { status: true },
      });
      await this.prisma.gstReturn.update({
        where: { id: filing.returnId },
        data: {
          status: FilingStatus.FILED,
          filedAt: new Date(),
          filedById: actor.userId,
          referenceNo: body.referenceNo ?? filing.referenceNo ?? null,
        },
      });
      if (linked) {
        await this.prisma.filingStatusEvent.create({
          data: {
            returnId: filing.returnId,
            clientId: updated.clientId,
            status: FilingStatus.FILED,
            previousStatus: linked.status,
            source: FilingEventSource.MANUAL,
            actorId: actor.userId,
            actorName: actor.name ?? null,
          },
        });
      }
    }

    await this.audit.recordAs(actor, {
      action: 'filing.status',
      entity: 'Filing',
      entityId: updated.id,
      meta: { status: updated.status, returnId: updated.returnId },
    });
    return serialiseFiling(updated);
  }

  async listFilingHistory(actor: Actor, filingId: string): Promise<FilingStatusEvent[]> {
    const filing = await this.prisma.filing.findFirst({
      where: { id: filingId, ...(actor.firmId ? { client: { is: { firmId: actor.firmId } } } : {}) },
      select: { id: true },
    });
    if (!filing) throw new NotFoundException('Filing not found');
    const events = await this.prisma.filingStatusEvent.findMany({
      where: { filingId: filing.id },
      orderBy: { createdAt: 'desc' },
    });
    return events.map(serialiseFilingEvent);
  }

  async listReturnHistory(actor: Actor, returnId: string): Promise<FilingStatusEvent[]> {
    const gstReturn = await this.prisma.gstReturn.findFirst({
      where: { id: returnId, ...(actor.firmId ? { client: { is: { firmId: actor.firmId } } } : {}) },
      select: { id: true },
    });
    if (!gstReturn) throw new NotFoundException('Return not found');
    const events = await this.prisma.filingStatusEvent.findMany({
      where: { returnId: gstReturn.id },
      orderBy: { createdAt: 'desc' },
    });
    return events.map(serialiseFilingEvent);
  }

  // Called from SMS ingest when a GSTN acknowledgement carries an ARN, return
  // type and period. Transitions the matching open return (and any linked
  // filings) to FILED, recording SMS-sourced history. Idempotent.
  async applyFiledReturnFromSms(input: {
    clientId: string;
    returnType: ReturnType;
    period: string;
    referenceNo: string;
    smsMessageId: string;
    filedAt: Date;
  }): Promise<{ updated: boolean; returnId: string | null }> {
    const gstReturn = await this.prisma.gstReturn.findFirst({
      where: {
        clientId: input.clientId,
        type: input.returnType,
        period: input.period,
        status: { not: FilingStatus.FILED },
      },
      select: { id: true, status: true },
    });
    if (!gstReturn) return { updated: false, returnId: null };

    await this.prisma.$transaction(async (tx) => {
      await tx.gstReturn.update({
        where: { id: gstReturn.id },
        data: {
          status: FilingStatus.FILED,
          filedAt: input.filedAt,
          filedById: null,
          referenceNo: input.referenceNo,
        },
      });
      await tx.filingStatusEvent.create({
        data: {
          returnId: gstReturn.id,
          clientId: input.clientId,
          status: FilingStatus.FILED,
          previousStatus: gstReturn.status,
          source: FilingEventSource.SMS,
          smsMessageId: input.smsMessageId,
          note: 'Auto-filed from GSTN acknowledgement SMS',
        },
      });

      const filings = await tx.filing.findMany({
        where: { returnId: gstReturn.id, status: { not: FilingStatus.FILED } },
        select: { id: true, status: true },
      });
      for (const filing of filings) {
        await tx.filing.update({
          where: { id: filing.id },
          data: {
            status: FilingStatus.FILED,
            filedAt: input.filedAt,
            filedById: null,
            referenceNo: input.referenceNo,
          },
        });
        await tx.filingStatusEvent.create({
          data: {
            filingId: filing.id,
            returnId: gstReturn.id,
            clientId: input.clientId,
            status: FilingStatus.FILED,
            previousStatus: filing.status,
            source: FilingEventSource.SMS,
            smsMessageId: input.smsMessageId,
            note: 'Auto-filed from GSTN acknowledgement SMS',
          },
        });
      }
    });

    return { updated: true, returnId: gstReturn.id };
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
