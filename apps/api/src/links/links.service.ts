import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LinkStatus, Role } from '@gstflow/types';
import type { ClientLink } from '@gstflow/types';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CONSENT_VERSION } from '../common/constants';
import { serialiseClientLink } from '../common/serializers';
import type { Actor } from '../common/auth/actor.types';

const firmSelect = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  brandColor: true,
  supportEmail: true,
  supportPhone: true,
} as const;

/**
 * Party-facing (mobile client) link management.
 *
 * A firm adds a party by mobile number; the party signs in with the same number
 * and must explicitly confirm before the link becomes ACTIVE and any SMS is
 * shared. This service is scoped by the authenticated party's phone number, so
 * a party can only ever see and act on links that belong to their own number.
 */
@Injectable()
export class LinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async phoneFor(actor: Actor): Promise<string> {
    if (actor.role !== Role.CLIENT || !actor.clientId) {
      throw new ForbiddenException('Client access only');
    }
    const client = await this.prisma.client.findUnique({
      where: { id: actor.clientId },
      select: { phone: true },
    });
    if (!client) throw new ForbiddenException('Client not found');
    return client.phone;
  }

  private async resolve(actor: Actor, id: string) {
    const phone = await this.phoneFor(actor);
    const client = await this.prisma.client.findFirst({
      where: { id, phone },
      include: { firm: { select: firmSelect } },
    });
    if (!client) throw new NotFoundException('Link not found');
    return client;
  }

  async list(actor: Actor): Promise<ClientLink[]> {
    const phone = await this.phoneFor(actor);
    const rows = await this.prisma.client.findMany({
      where: { phone, status: { not: 'ARCHIVED' } },
      include: { firm: { select: firmSelect } },
      orderBy: [{ linkRequestedAt: 'desc' }],
    });
    return rows.map(serialiseClientLink);
  }

  async confirm(actor: Actor, id: string): Promise<ClientLink> {
    const existing = await this.resolve(actor, id);
    if (existing.linkStatus === LinkStatus.ACTIVE) {
      return serialiseClientLink(existing);
    }

    const now = new Date();
    const [, client] = await this.prisma.$transaction([
      this.prisma.consentRecord.create({
        data: {
          clientId: id,
          version: CONSENT_VERSION,
          otpVerified: true,
          acceptedAt: now,
        },
      }),
      this.prisma.client.update({
        where: { id },
        data: {
          linkStatus: LinkStatus.ACTIVE,
          linkConfirmedAt: now,
          linkRejectedAt: null,
          linkRevokedAt: null,
          consentGranted: true,
        },
      }),
    ]);

    await this.audit.recordAs(actor, {
      action: 'client.link.confirm',
      entity: 'Client',
      entityId: id,
      meta: { firmId: existing.firmId },
    });

    return serialiseClientLink({ ...client, firm: existing.firm });
  }

  async reject(actor: Actor, id: string): Promise<ClientLink> {
    const existing = await this.resolve(actor, id);
    const now = new Date();
    const [, client] = await this.prisma.$transaction([
      this.prisma.consentRecord.updateMany({
        where: { clientId: id, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.client.update({
        where: { id },
        data: {
          linkStatus: LinkStatus.REJECTED,
          linkRejectedAt: now,
          consentGranted: false,
        },
      }),
      this.prisma.device.updateMany({
        where: { clientId: id, revoked: false },
        data: { revoked: true },
      }),
    ]);

    await this.audit.recordAs(actor, {
      action: 'client.link.reject',
      entity: 'Client',
      entityId: id,
      meta: { firmId: existing.firmId },
    });

    return serialiseClientLink({ ...client, firm: existing.firm });
  }

  async revoke(actor: Actor, id: string): Promise<ClientLink> {
    const existing = await this.resolve(actor, id);
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
      meta: { firmId: existing.firmId },
    });

    return serialiseClientLink({ ...client, firm: existing.firm });
  }
}
