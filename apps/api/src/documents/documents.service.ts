import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentType, Role } from '@gstflow/types';
import type { Document, PaginatedDocuments } from '@gstflow/types';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { SUPPORTED_AUDIO_MIME } from '../common/constants';
import { paginate, parsePagination } from '../common/pagination';
import { serialiseDocument } from '../common/serializers';
import type { Actor } from '../common/auth/actor.types';
import { StorageService } from '../storage/storage.service';
import type { ListDocumentsQueryDto, UploadDocumentDto, UploadedDocumentFile } from './dto';

type DocumentWithClient = Prisma.DocumentGetPayload<{
  include: { client: { select: { firmId: true } } };
}>;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private get maxUploadMb(): number {
    const mb = Number(this.config.get<string>('MAX_UPLOAD_MB') ?? 25);
    return Number.isFinite(mb) && mb > 0 ? mb : 25;
  }

  async upload(
    actor: Actor,
    file: UploadedDocumentFile | undefined,
    dto: UploadDocumentDto,
  ): Promise<Document> {
    if (!file) throw new BadRequestException('file is required');
    if (!SUPPORTED_AUDIO_MIME.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }
    if (file.size > this.maxUploadMb * 1024 * 1024) {
      throw new BadRequestException(`File exceeds the ${this.maxUploadMb} MB limit`);
    }

    const client = await this.getAccessibleClient(actor, dto.clientId);

    if (dto.smsMessageId) {
      const sms = await this.prisma.smsMessage.findFirst({
        where: { id: dto.smsMessageId, clientId: client.id },
      });
      if (!sms) throw new BadRequestException('smsMessageId does not belong to this client');
    }

    const { storageKey, size } = await this.storage.save(file.buffer, file.originalname);

    const created = await this.prisma.document.create({
      data: {
        clientId: client.id,
        smsMessageId: dto.smsMessageId ?? null,
        type: dto.type ?? DocumentType.OTHER,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size,
        storageKey,
        uploadedById: actor.userId,
      },
    });

    await this.audit.recordAs(actor, {
      action: 'document.upload',
      entity: 'Document',
      entityId: created.id,
      meta: {
        clientId: client.id,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size,
      },
    });

    return serialiseDocument(created);
  }

  async list(actor: Actor, query: ListDocumentsQueryDto): Promise<PaginatedDocuments> {
    const slice = parsePagination(query);
    const where = this.scopeWhere(actor);
    if (query.clientId) where.clientId = query.clientId;
    if (query.type) where.type = query.type;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        skip: slice.skip,
        take: slice.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.document.count({ where }),
    ]);

    return paginate(rows.map(serialiseDocument), total, slice);
  }

  async get(actor: Actor, id: string): Promise<Document> {
    const doc = await this.getAccessibleDocument(actor, id);
    return serialiseDocument(doc);
  }

  async download(
    actor: Actor,
    id: string,
  ): Promise<{ document: Document; stream: NodeJS.ReadableStream }> {
    const doc = await this.getAccessibleDocument(actor, id);
    return { document: serialiseDocument(doc), stream: this.storage.getStream(doc.storageKey) };
  }

  private scopeWhere(actor: Actor): Prisma.DocumentWhereInput {
    if (actor.role === Role.SUPER_ADMIN) return {};
    if (!actor.firmId) throw new ForbiddenException('Your account is not linked to a firm');
    return { client: { firmId: actor.firmId } };
  }

  private async getAccessibleClient(actor: Actor, clientId: string) {
    const where: Prisma.ClientWhereInput = { id: clientId };
    if (actor.role !== Role.SUPER_ADMIN) {
      if (!actor.firmId) throw new ForbiddenException('Your account is not linked to a firm');
      where.firmId = actor.firmId;
    }
    const client = await this.prisma.client.findFirst({ where });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  private async getAccessibleDocument(actor: Actor, id: string): Promise<DocumentWithClient> {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: { client: { select: { firmId: true } } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (actor.role !== Role.SUPER_ADMIN && doc.client.firmId !== actor.firmId) {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }
}
