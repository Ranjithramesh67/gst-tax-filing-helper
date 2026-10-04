import { Controller, Get, Param } from '@nestjs/common';
import type { FirmBranding, SmsRetentionPolicy } from '@gstflow/types';

import { Public } from '../common/decorators/public.decorator';
import { PublicService } from './public.service';
import { RetentionService } from '../settings/retention.service';

@Controller('public')
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly retention: RetentionService,
  ) {}

  @Public()
  @Get('firms/:slug')
  async branding(@Param('slug') slug: string): Promise<FirmBranding> {
    return this.publicService.branding(slug);
  }

  @Public()
  @Get('retention')
  async retentionPolicy(): Promise<SmsRetentionPolicy> {
    return this.retention.getPolicy();
  }
}
