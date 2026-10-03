import { Injectable, NotFoundException } from '@nestjs/common';
import type { FirmBranding } from '@gstflow/types';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async branding(slug: string): Promise<FirmBranding> {
    const firm = await this.prisma.firm.findUnique({
      where: { slug: slug.trim().toLowerCase() },
    });
    if (!firm) throw new NotFoundException('Firm not found');
    return {
      name: firm.name,
      slug: firm.slug,
      logoUrl: firm.logoUrl,
      brandColor: firm.brandColor,
      supportEmail: firm.supportEmail,
      supportPhone: firm.supportPhone,
      address: firm.address,
      defaultFilingFee: firm.defaultFilingFee,
      status: firm.status as FirmBranding['status'],
    };
  }
}
