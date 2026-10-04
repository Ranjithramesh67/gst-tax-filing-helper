import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdminSmsMessage, PaginatedAdminSms } from '@gstflow/types';

import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { paginate, parsePagination } from '../common/pagination';
import type { ListSmsQuery } from './dto';

const smsInclude = Prisma.validator<Prisma.SmsMessageInclude>()({
  client: {
    select: {
      id: true,
      name: true,
      gstin: true,
      firm: { select: { id: true, name: true, slug: true } },
    },
  },
});

type AdminSmsRow = Prisma.SmsMessageGetPayload<{ include: typeof smsInclude }>;

@Injectable()
export class AdminSmsService {
  private readonly logger = new Logger(AdminSmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  private decrypt(payload: string): string {
    try {
      return this.crypto.decrypt(payload);
    } catch (error) {
      this.logger.warn(`Failed to decrypt SMS body: ${String(error)}`);
      return '';
    }
  }

  private serialise(row: AdminSmsRow): AdminSmsMessage {
    return {
      id: row.id,
      clientId: row.clientId,
      clientName: row.client?.name ?? null,
      clientGstin: row.client?.gstin ?? null,
      firmId: row.client?.firm?.id ?? null,
      firmName: row.client?.firm?.name ?? null,
      firmSlug: row.client?.firm?.slug ?? null,
      deviceId: row.deviceId,
      sender: row.sender,
      body: this.decrypt(row.bodyEncrypted),
      receivedAt: row.receivedAt.toISOString(),
      category: row.category as AdminSmsMessage['category'],
      status: row.status as AdminSmsMessage['status'],
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(query: ListSmsQuery): Promise<PaginatedAdminSms> {
    const slice = parsePagination({ page: query.page, pageSize: query.pageSize });

    const where: Prisma.SmsMessageWhereInput = {};
    if (query.clientId) where.clientId = query.clientId;
    if (query.firmId) where.client = { firmId: query.firmId };
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { sender: { contains: query.search, mode: 'insensitive' } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const receivedAt: Prisma.DateTimeFilter = {};
    if (query.from) receivedAt.gte = query.from;
    if (query.to) receivedAt.lte = query.to;
    if (receivedAt.gte || receivedAt.lte) where.receivedAt = receivedAt;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.smsMessage.findMany({
        where,
        include: smsInclude,
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
}
