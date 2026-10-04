import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Firm } from '@gstflow/types';

import { AuditService } from '../common/audit/audit.service';
import { serialiseFirm } from '../common/serializers';
import type { Actor } from '../common/auth/actor.types';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateFirmSettingsInput } from './dto';

@Injectable()
export class FirmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getProfile(actor: Actor): Promise<Firm> {
    const id = this.requireActorFirm(actor);
    const firm = await this.prisma.firm.findUnique({
      where: { id },
      include: { _count: { select: { clients: true, users: true } } },
    });
    if (!firm) throw new NotFoundException('Firm not found');
    return serialiseFirm(firm);
  }

  async updateProfile(input: UpdateFirmSettingsInput, actor: Actor): Promise<Firm> {
    const id = this.requireActorFirm(actor);
    await this.requireFirm(id);

    const firm = await this.prisma.firm.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.gstin !== undefined ? { gstin: input.gstin } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.brandColor !== undefined ? { brandColor: input.brandColor } : {}),
        ...(input.supportEmail !== undefined ? { supportEmail: input.supportEmail } : {}),
        ...(input.supportPhone !== undefined ? { supportPhone: input.supportPhone } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.defaultFilingFee !== undefined
          ? { defaultFilingFee: input.defaultFilingFee }
          : {}),
      },
    });

    await this.audit.recordAs(actor, {
      action: 'firm.profile.update',
      entity: 'Firm',
      entityId: firm.id,
      meta: { fields: Object.keys(input) },
    });
    return serialiseFirm(firm);
  }

  private requireActorFirm(actor: Actor): string {
    if (!actor.firmId) {
      throw new BadRequestException('No firm is associated with this account');
    }
    return actor.firmId;
  }

  private async requireFirm(id: string): Promise<void> {
    const firm = await this.prisma.firm.findUnique({ where: { id }, select: { id: true } });
    if (!firm) throw new NotFoundException('Firm not found');
  }
}
