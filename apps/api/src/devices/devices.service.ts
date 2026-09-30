import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Device as PrismaDevice } from '@prisma/client';
import { Role } from '@gstflow/types';
import type { Device } from '@gstflow/types';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { parsePagination } from '../common/pagination';
import { serialiseDevice } from '../common/serializers';
import type { Actor } from '../common/auth/actor.types';
import type { DeviceRegisterBodyInput, ListDevicesQuery } from './dto';

type DeviceWithClient = PrismaDevice & { client: { firmId: string } };

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: Actor, query: ListDevicesQuery): Promise<Device[]> {
    const slice = parsePagination(query);
    const where: Prisma.DeviceWhereInput = {};

    if (actor.role !== Role.SUPER_ADMIN) {
      where.client = { firmId: actor.firmId ?? '' };
    }
    if (query.clientId) {
      await this.assertClientAccess(actor, query.clientId);
      where.clientId = query.clientId;
    }
    if (query.revoked !== undefined) {
      where.revoked = query.revoked === true || query.revoked === 'true';
    }

    const devices = await this.prisma.device.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: slice.skip,
      take: slice.take,
    });
    return devices.map((device) => serialiseDevice(device));
  }

  async get(actor: Actor, deviceId: string): Promise<Device> {
    const device = await this.findDeviceForActor(actor, deviceId);
    return serialiseDevice(device);
  }

  async register(actor: Actor, body: DeviceRegisterBodyInput): Promise<Device> {
    let clientId: string;
    if (actor.role === Role.CLIENT) {
      if (!actor.clientId) throw new ForbiddenException('No client associated with this account');
      clientId = actor.clientId;
    } else {
      if (!body.clientId) throw new BadRequestException('clientId is required for staff');
      await this.assertClientAccess(actor, body.clientId);
      clientId = body.clientId;
    }

    const now = new Date();
    const device = await this.prisma.device.upsert({
      where: { clientId_androidId: { clientId, androidId: body.androidId } },
      create: {
        clientId,
        androidId: body.androidId,
        platform: body.platform,
        model: body.model,
        osVersion: body.osVersion,
        appVersion: body.appVersion,
        pushToken: body.pushToken,
        revoked: false,
        lastSeenAt: now,
      },
      update: {
        platform: body.platform,
        model: body.model,
        osVersion: body.osVersion,
        appVersion: body.appVersion,
        pushToken: body.pushToken,
        revoked: false,
        lastSeenAt: now,
      },
    });

    await this.audit.recordAs(actor, {
      action: 'device.register',
      entity: 'Device',
      entityId: device.id,
      meta: { clientId, androidId: device.androidId },
    });

    return serialiseDevice(device);
  }

  async revoke(actor: Actor, deviceId: string): Promise<Device> {
    const device = await this.findDeviceForActor(actor, deviceId);
    const now = new Date();

    const [updated] = await this.prisma.$transaction([
      this.prisma.device.update({
        where: { id: device.id },
        data: { revoked: true },
      }),
      this.prisma.consentRecord.updateMany({
        where: { deviceId: device.id, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.client.update({
        where: { id: device.clientId },
        data: { consentGranted: false },
      }),
    ]);

    await this.audit.recordAs(actor, {
      action: 'device.revoke',
      entity: 'Device',
      entityId: updated.id,
      meta: { clientId: updated.clientId },
    });

    return serialiseDevice(updated);
  }

  async heartbeat(actor: Actor, deviceId: string): Promise<{ success: boolean }> {
    const device = await this.findDeviceForActor(actor, deviceId);
    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });
    return { success: true };
  }

  private async findDeviceForActor(actor: Actor, deviceId: string): Promise<DeviceWithClient> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: { client: { select: { firmId: true } } },
    });
    if (!device) throw new NotFoundException('Device not found');

    if (actor.role === Role.CLIENT) {
      if (device.clientId !== actor.clientId) throw new NotFoundException('Device not found');
      return device;
    }

    if (actor.role !== Role.SUPER_ADMIN && device.client.firmId !== actor.firmId) {
      throw new NotFoundException('Device not found');
    }
    return device;
  }

  private async assertClientAccess(actor: Actor, clientId: string): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, firmId: true },
    });
    if (!client) throw new NotFoundException('Client not found');
    if (actor.role !== Role.SUPER_ADMIN && client.firmId !== actor.firmId) {
      throw new NotFoundException('Client not found');
    }
  }
}
