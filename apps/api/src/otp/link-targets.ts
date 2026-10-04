import { ForbiddenException } from '@nestjs/common';
import { LinkStatus } from '@gstflow/types';

import type { PrismaService } from '../prisma/prisma.service';

export interface LinkedTarget {
  id: string;
  firmId: string;
}

/**
 * Resolves the mutually-confirmed firm links an ingested message should fan out
 * to for a client. Shared by SMS and email ingest so consent, source-phone and
 * ACTIVE-link rules stay identical. A party linked to several firms fans out to
 * every ACTIVE link; unconfirmed (PENDING/REJECTED/REVOKED) links get nothing.
 */
export async function resolveActiveLinkTargets(
  prisma: PrismaService,
  clientId: string,
): Promise<LinkedTarget[]> {
  const consent = await prisma.consentRecord.findFirst({
    where: { clientId, otpVerified: true, revokedAt: null },
    orderBy: { acceptedAt: 'desc' },
  });
  if (!consent) throw new ForbiddenException('Consent is not active');

  const source = await prisma.client.findUnique({
    where: { id: clientId },
    select: { phone: true },
  });
  if (!source) throw new ForbiddenException('No client is associated with this account');

  const targets = await prisma.client.findMany({
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
  return targets;
}
