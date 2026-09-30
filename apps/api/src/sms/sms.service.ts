import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role } from '@gstflow/types';
import type {
  ClassifySmsBody,
  PaginatedSms,
  SmsIngestBody,
  SmsIngestResponse,
  SmsMessage,
} from '@gstflow/types';

import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import { paginate, parsePagination } from '../common/pagination';
import { serialiseSms } from '../common/serializers';
import type { Actor } from '../common/auth/actor.types';
import { classifySms, parseGstSms } from './sms-parser';
import type { SmsListQueryDto } from './dto';

const listInclude = Prisma.validator<Prisma.SmsMessageInclude>()({
  client: { select: { id: true, name: true, gstin: true } },
  parsed: true,
});

const detailInclude = Prisma.validator<Prisma.SmsMessageInclude>()({
  client: { select: { id: true, name: true, gstin: true } },
  parsed: true,
  documents: true,
});

type SmsListRow = Prisma.SmsMessageGetPayload<{ include: typeof listInclude }>;
type SmsDetailRow = Prisma.SmsMessageGetPayload<{ include: typeof detailInclude }>;

function toNumber(value: string | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasParsedField(parsed: ReturnType<typeof parseGstSms>): boolean {
  return (
    parsed.gstin != null ||
    parsed.invoiceNo != null ||
    parsed.amount != null ||
    parsed.taxableValue != null ||
    parsed.taxAmount != null ||
    parsed.hsn != null ||
    parsed.dueDate != null
  );
}

function parsedToJson(parsed: ReturnType<typeof parseGstSms>): Prisma.InputJsonValue {
  return {
    gstin: parsed.gstin,
    invoiceNo: parsed.invoiceNo,
    amount: parsed.amount,
    taxableValue: parsed.taxableValue,
    taxAmount: parsed.taxAmount,
    hsn: parsed.hsn,
    dueDate: parsed.dueDate ? parsed.dueDate.toISOString() : null,
    confidence: parsed.confidence,
  };
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  private scope(actor: Actor): Prisma.SmsMessageWhereInput {
    if (actor.role === Role.SUPER_ADMIN) return {};
    return { client: { firmId: actor.firmId ?? '__no_firm__' } };
  }

  private decrypt(payload: string): string {
    try {
      return this.crypto.decrypt(payload);
    } catch (error) {
      this.logger.warn(`Failed to decrypt SMS body: ${String(error)}`);
      return '';
    }
  }

  private serialise(row: SmsListRow | SmsDetailRow): SmsMessage {
    return serialiseSms({ ...row, body: this.decrypt(row.bodyEncrypted) });
  }

  private async persistParsed(smsMessageId: string, rawBody: string): Promise<void> {
    const parsed = parseGstSms(rawBody);
    if (!hasParsedField(parsed)) return;
    await this.prisma.parsedGstData.create({
      data: {
        smsMessageId,
        gstin: parsed.gstin,
        invoiceNo: parsed.invoiceNo,
        amount: parsed.amount,
        taxableValue: parsed.taxableValue,
        taxAmount: parsed.taxAmount,
        hsn: parsed.hsn,
        dueDate: parsed.dueDate,
        confidence: parsed.confidence,
        rawJson: parsedToJson(parsed),
      },
    });
  }

  async ingest(actor: Actor, body: SmsIngestBody): Promise<SmsIngestResponse> {
    const clientId = actor.clientId;
    if (actor.role !== Role.CLIENT || !clientId) {
      throw new ForbiddenException('No client is associated with this account');
    }

    const consent = await this.prisma.consentRecord.findFirst({
      where: { clientId, otpVerified: true, revokedAt: null },
      orderBy: { acceptedAt: 'desc' },
    });
    if (!consent) throw new ForbiddenException('Consent is not active');

    const deviceIds = [
      ...new Set(
        body.items.map((item) => item.deviceId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const allowedDevices = new Set<string>();
    if (deviceIds.length > 0) {
      const devices = await this.prisma.device.findMany({
        where: { clientId, id: { in: deviceIds }, revoked: false },
        select: { id: true },
      });
      for (const device of devices) allowedDevices.add(device.id);
    }

    let accepted = 0;
    let duplicates = 0;
    let rejected = 0;
    let lastReceivedAt: Date | null = null;
    const ids: string[] = [];

    for (const item of body.items) {
      if (item.deviceId && !allowedDevices.has(item.deviceId)) {
        rejected += 1;
        continue;
      }

      const receivedAt = new Date(item.receivedAt);
      if (Number.isNaN(receivedAt.getTime())) {
        rejected += 1;
        continue;
      }

      try {
        const created = await this.prisma.smsMessage.create({
          data: {
            clientId,
            deviceId: item.deviceId ?? null,
            sender: item.sender,
            bodyEncrypted: this.crypto.encrypt(item.body),
            receivedAt,
            category: classifySms(item.body, item.sender),
            hash: item.hash,
          },
        });
        accepted += 1;
        ids.push(created.id);
        if (!lastReceivedAt || receivedAt > lastReceivedAt) lastReceivedAt = receivedAt;
        await this.persistParsed(created.id, item.body);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          duplicates += 1;
        } else {
          this.logger.error(`Failed to ingest SMS: ${String(error)}`);
          rejected += 1;
        }
      }
    }

    if (accepted > 0) {
      await this.prisma.client.update({
        where: { id: clientId },
        data: { lastSmsAt: lastReceivedAt ?? new Date() },
      });
    }

    await this.audit.recordAs(actor, {
      action: 'sms.ingest',
      entity: 'SmsMessage',
      meta: { accepted, duplicates, rejected },
    });

    return { accepted, duplicates, rejected, ids };
  }

  async list(actor: Actor, query: SmsListQueryDto): Promise<PaginatedSms> {
    const slice = parsePagination({
      page: toNumber(query.page),
      pageSize: toNumber(query.pageSize),
    });

    const where: Prisma.SmsMessageWhereInput = { ...this.scope(actor) };
    if (query.clientId) where.clientId = query.clientId;
    if (query.category) where.category = query.category as SmsMessage['category'];
    if (query.status) where.status = query.status as SmsMessage['status'];
    if (query.search) where.sender = { contains: query.search, mode: 'insensitive' };

    const receivedAt: Prisma.DateTimeFilter = {};
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from && !Number.isNaN(from.getTime())) receivedAt.gte = from;
    if (to && !Number.isNaN(to.getTime())) receivedAt.lte = to;
    if (receivedAt.gte || receivedAt.lte) where.receivedAt = receivedAt;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.smsMessage.findMany({
        where,
        include: listInclude,
        orderBy: { receivedAt: 'desc' },
        skip: slice.skip,
        take: slice.take,
      }),
      this.prisma.smsMessage.count({ where }),
    ]);

    return paginate(
      rows.map((row) => this.serialise(row)),
      total,
      slice,
    );
  }

  async getById(actor: Actor, id: string): Promise<SmsMessage> {
    const row = await this.prisma.smsMessage.findFirst({
      where: { id, ...this.scope(actor) },
      include: detailInclude,
    });
    if (!row) throw new NotFoundException('SMS message not found');
    return this.serialise(row);
  }

  async classify(actor: Actor, id: string, body: ClassifySmsBody): Promise<SmsMessage> {
    const existing = await this.prisma.smsMessage.findFirst({
      where: { id, ...this.scope(actor) },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('SMS message not found');

    const row = await this.prisma.smsMessage.update({
      where: { id },
      data: {
        category: body.category,
        ...(body.status ? { status: body.status } : {}),
      },
      include: detailInclude,
    });

    await this.audit.recordAs(actor, {
      action: 'sms.classify',
      entity: 'SmsMessage',
      entityId: id,
      meta: { category: body.category, status: body.status ?? row.status },
    });

    return this.serialise(row);
  }
}
