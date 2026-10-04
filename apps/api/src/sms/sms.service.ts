import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { extractOtp } from '@gstflow/otp';
import { LinkStatus, Role } from '@gstflow/types';
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
import { FilingsService } from '../filings/filings.service';
import { OtpService } from '../otp/otp.service';
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

/**
 * Canonical de-duplication hash for an ingested SMS. The client sends its own
 * hash, but the broadcast timestamp and the inbox `date` column can differ in
 * sub-second precision for the same physical message. Hashing the body with a
 * whole-second timestamp makes both capture paths (and any client version)
 * collide, so the same SMS is stored once per client.
 */
export function canonicalSmsHash(
  hash: (value: string) => string,
  sender: string,
  body: string,
  receivedAt: Date,
): string {
  const seconds = Math.floor(receivedAt.getTime() / 1000) * 1000;
  return hash(`${sender}|${body}|${new Date(seconds).toISOString()}`);
}

function hasParsedField(parsed: ReturnType<typeof parseGstSms>): boolean {
  return (
    parsed.gstin != null ||
    parsed.invoiceNo != null ||
    parsed.amount != null ||
    parsed.taxableValue != null ||
    parsed.taxAmount != null ||
    parsed.hsn != null ||
    parsed.dueDate != null ||
    parsed.returnType != null ||
    parsed.period != null ||
    parsed.arn != null ||
    parsed.lateFee != null ||
    parsed.filed
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
    returnType: parsed.returnType,
    period: parsed.period,
    arn: parsed.arn,
    lateFee: parsed.lateFee,
    filed: parsed.filed,
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
    private readonly filings: FilingsService,
    private readonly otp: OtpService,
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
        returnType: parsed.returnType,
        period: parsed.period,
        arn: parsed.arn,
        lateFee: parsed.lateFee,
        filed: parsed.filed,
        confidence: parsed.confidence,
        rawJson: parsedToJson(parsed),
      },
    });
  }

  // A filed GSTN acknowledgement SMS (ARN + return type + period) reconciles the
  // matching open return for that client. Failures here must never fail ingest.
  private async reconcileFiling(
    smsMessageId: string,
    clientId: string,
    rawBody: string,
    receivedAt: Date,
  ): Promise<void> {
    const parsed = parseGstSms(rawBody);
    if (!parsed.filed || !parsed.arn || !parsed.returnType || !parsed.period) return;
    try {
      await this.filings.applyFiledReturnFromSms({
        clientId,
        returnType: parsed.returnType,
        period: parsed.period,
        referenceNo: parsed.arn,
        smsMessageId,
        filedAt: receivedAt,
      });
    } catch (error) {
      this.logger.warn(`Failed to reconcile filing from SMS: ${String(error)}`);
    }
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

    const source = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { phone: true },
    });
    if (!source) throw new ForbiddenException('No client is associated with this account');

    // Mutual consent: a message is only shared with firms whose link the party
    // has confirmed. A party linked to several firms has their SMS fanned out to
    // every ACTIVE link; unconfirmed (PENDING/REJECTED/REVOKED) links get nothing.
    const targets = await this.prisma.client.findMany({
      where: {
        phone: source.phone,
        status: { not: 'ARCHIVED' },
        linkStatus: LinkStatus.ACTIVE,
      },
      select: { id: true, firmId: true },
    });
    if (targets.length === 0) {
      throw new ForbiddenException('No confirmed firm is linked to this number');
    }
    const targetIds = targets.map((target) => target.id);
    const firmOfClient = new Map(targets.map((target) => [target.id, target.firmId]));

    const deviceIds = [
      ...new Set(
        body.items.map((item) => item.deviceId).filter((id): id is string => Boolean(id)),
      ),
    ];
    // Clients send either the Device id or its hardware androidId. Resolve both
    // to the canonical Device (and its owning client) so the FK is valid and the
    // per-firm ownership check holds.
    const deviceByKey = new Map<string, { id: string; clientId: string }>();
    if (deviceIds.length > 0) {
      const devices = await this.prisma.device.findMany({
        where: {
          clientId: { in: targetIds },
          revoked: false,
          OR: [{ id: { in: deviceIds } }, { androidId: { in: deviceIds } }],
        },
        select: { id: true, androidId: true, clientId: true },
      });
      for (const device of devices) {
        deviceByKey.set(device.id, { id: device.id, clientId: device.clientId });
        deviceByKey.set(device.androidId, { id: device.id, clientId: device.clientId });
      }
    }

    let accepted = 0;
    let duplicates = 0;
    let rejected = 0;
    let lastReceivedAt: Date | null = null;
    const ids: string[] = [];

    for (const item of body.items) {
      const itemDevice = item.deviceId ? deviceByKey.get(item.deviceId) : undefined;
      if (item.deviceId && !itemDevice) {
        rejected += 1;
        continue;
      }

      const receivedAt = new Date(item.receivedAt);
      if (Number.isNaN(receivedAt.getTime())) {
        rejected += 1;
        continue;
      }

      let createdAny = false;
      let duplicateOnly = true;
      for (const targetId of targetIds) {
        const deviceId = itemDevice && itemDevice.clientId === targetId ? itemDevice.id : null;
        try {
          const created = await this.prisma.smsMessage.create({
            data: {
              clientId: targetId,
              deviceId,
              sender: item.sender,
              bodyEncrypted: this.crypto.encrypt(item.body),
              receivedAt,
              category: classifySms(item.body, item.sender),
              hash: canonicalSmsHash(this.crypto.hash, item.sender, item.body, receivedAt),
            },
          });
          createdAny = true;
          duplicateOnly = false;
          ids.push(created.id);
          if (!lastReceivedAt || receivedAt > lastReceivedAt) lastReceivedAt = receivedAt;
          await this.persistParsed(created.id, item.body);
          const otp = extractOtp(item.body);
          if (otp) {
            await this.otp.recordFromSms({
              firmId: firmOfClient.get(targetId)!,
              clientId: targetId,
              deviceId,
              code: otp.code,
              snippet: otp.snippet,
              receivedAt,
              sourceRef: created.id,
            });
          }
          await this.reconcileFiling(created.id, targetId, item.body, receivedAt);
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            // Already stored for this firm; not an error.
          } else {
            this.logger.error(`Failed to ingest SMS: ${String(error)}`);
            duplicateOnly = false;
          }
        }
      }

      if (createdAny) accepted += 1;
      else if (duplicateOnly) duplicates += 1;
      else rejected += 1;
    }

    if (accepted > 0) {
      await this.prisma.client.updateMany({
        where: { id: { in: targetIds } },
        data: { lastSmsAt: lastReceivedAt ?? new Date() },
      });
    }

    await this.audit.recordAs(actor, {
      action: 'sms.ingest',
      entity: 'SmsMessage',
      meta: { accepted, duplicates, rejected, firms: targetIds.length },
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
