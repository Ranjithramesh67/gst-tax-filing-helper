import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClientStatus, LinkStatus, Role } from '@gstflow/types';
import type { Client, ConsentRecord, PaginatedClients } from '@gstflow/types';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { parsePagination, paginate } from '../common/pagination';
import { serialiseClient, serialiseConsent } from '../common/serializers';
import type { Actor } from '../common/auth/actor.types';
import type { CreateClientDto, ListClientsQueryDto, UpdateClientDto } from './dto';

const COUNT_SELECT = { smsMessages: true, devices: true, documents: true } as const;

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: Actor, query: ListClientsQueryDto): Promise<PaginatedClients> {
    const where: Prisma.ClientWhereInput = {};

    if (actor.role === Role.SUPER_ADMIN) {
      if (query.firmId) where.firmId = query.firmId;
    } else {
      if (!actor.firmId) throw new ForbiddenException('No firm associated with this account');
      where.firmId = actor.firmId;
    }

    if (query.status) where.status = query.status;
    if (query.linkStatus) where.linkStatus = query.linkStatus as LinkStatus;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { gstin: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const slice = parsePagination(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: slice.skip,
        take: slice.take,
        include: { _count: { select: COUNT_SELECT } },
      }),
      this.prisma.client.count({ where }),
    ]);

    return paginate(rows.map(serialiseClient), total, slice);
  }

  async create(actor: Actor, body: CreateClientDto): Promise<Client> {
    const firmId = actor.role === Role.SUPER_ADMIN ? body.firmId ?? actor.firmId : actor.firmId;
    if (!firmId) throw new BadRequestException('firmId is required');

    if (actor.role === Role.SUPER_ADMIN && body.firmId) {
      const firm = await this.prisma.firm.findUnique({
        where: { id: body.firmId },
        select: { id: true },
      });
      if (!firm) throw new NotFoundException('Firm not found');
    }

    const client = await this.prisma.client.create({
      data: {
        firmId,
        name: body.name,
        phone: body.phone,
        gstin: normalise(body.gstin),
        pan: normalise(body.pan),
        email: body.email ?? null,
        address: body.address ?? null,
        stateCode: body.stateCode ?? null,
        // Mutual-consent: a newly added party must confirm from the mobile app
        // before any data is shared with the firm.
        linkStatus: LinkStatus.PENDING,
        linkRequestedAt: new Date(),
        linkNote: normalise(body.note),
      },
    });

    await this.audit.recordAs(actor, {
      action: 'client.create',
      entity: 'Client',
      entityId: client.id,
      meta: { firmId, name: client.name, gstin: client.gstin },
    });

    return serialiseClient(client);
  }

  async get(actor: Actor, id: string): Promise<Client> {
    const client = await this.prisma.client.findFirst({
      where: this.scopedWhere(actor, id),
      include: { _count: { select: COUNT_SELECT } },
    });
    if (!client) throw new NotFoundException('Client not found');
    return serialiseClient(client);
  }

  async update(actor: Actor, id: string, body: UpdateClientDto): Promise<Client> {
    await this.requireClient(actor, id);

    const data: Prisma.ClientUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.gstin !== undefined) data.gstin = normalise(body.gstin);
    if (body.pan !== undefined) data.pan = normalise(body.pan);
    if (body.email !== undefined) data.email = body.email;
    if (body.address !== undefined) data.address = body.address;
    if (body.stateCode !== undefined) data.stateCode = body.stateCode;
    if (body.status !== undefined) data.status = body.status;

    const client = await this.prisma.client.update({ where: { id }, data });

    await this.audit.recordAs(actor, {
      action: 'client.update',
      entity: 'Client',
      entityId: id,
      meta: { fields: Object.keys(data) },
    });

    return serialiseClient(client);
  }

  async archive(actor: Actor, id: string): Promise<{ success: boolean }> {
    await this.requireClient(actor, id);

    await this.prisma.client.update({
      where: { id },
      data: { status: ClientStatus.ARCHIVED },
    });

    await this.audit.recordAs(actor, {
      action: 'client.archive',
      entity: 'Client',
      entityId: id,
    });

    return { success: true };
  }

  async requestLink(actor: Actor, id: string, note?: string): Promise<Client> {
    await this.requireClient(actor, id);

    const client = await this.prisma.client.update({
      where: { id },
      data: {
        linkStatus: LinkStatus.PENDING,
        linkRequestedAt: new Date(),
        linkConfirmedAt: null,
        linkRejectedAt: null,
        linkRevokedAt: null,
        ...(note !== undefined ? { linkNote: normalise(note) } : {}),
      },
    });

    await this.audit.recordAs(actor, {
      action: 'client.link.request',
      entity: 'Client',
      entityId: id,
      meta: { note: note ?? null },
    });

    return serialiseClient(client);
  }

  async revokeLink(actor: Actor, id: string): Promise<Client> {
    await this.requireClient(actor, id);

    const now = new Date();
    const [, client] = await this.prisma.$transaction([
      this.prisma.consentRecord.updateMany({
        where: { clientId: id, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.client.update({
        where: { id },
        data: {
          linkStatus: LinkStatus.REVOKED,
          linkRevokedAt: now,
          consentGranted: false,
        },
      }),
      this.prisma.device.updateMany({
        where: { clientId: id, revoked: false },
        data: { revoked: true },
      }),
    ]);

    await this.audit.recordAs(actor, {
      action: 'client.link.revoke',
      entity: 'Client',
      entityId: id,
    });

    return serialiseClient(client);
  }

  async listConsents(actor: Actor, id: string): Promise<ConsentRecord[]> {
    await this.requireClient(actor, id);

    const consents = await this.prisma.consentRecord.findMany({
      where: { clientId: id },
      orderBy: { acceptedAt: 'desc' },
    });

    return consents.map(serialiseConsent);
  }

  async revokeConsents(actor: Actor, id: string): Promise<{ success: boolean }> {
    await this.requireClient(actor, id);

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.consentRecord.updateMany({
        where: { clientId: id, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.client.update({
        where: { id },
        data: { consentGranted: false },
      }),
      this.prisma.device.updateMany({
        where: { clientId: id, revoked: false },
        data: { revoked: true },
      }),
    ]);

    await this.audit.recordAs(actor, {
      action: 'consent.revoke',
      entity: 'Client',
      entityId: id,
      meta: { clientId: id },
    });

    return { success: true };
  }

  private scopedWhere(actor: Actor, id: string): Prisma.ClientWhereInput {
    if (actor.role === Role.SUPER_ADMIN) return { id };
    if (!actor.firmId) throw new ForbiddenException('No firm associated with this account');
    return { id, firmId: actor.firmId };
  }

  private async requireClient(actor: Actor, id: string): Promise<void> {
    const exists = await this.prisma.client.findFirst({
      where: this.scopedWhere(actor, id),
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Client not found');
  }
}

function normalise(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
