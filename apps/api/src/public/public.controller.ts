import { Controller, Get, Param } from '@nestjs/common';
import type { FirmBranding } from '@gstflow/types';

import { Public } from '../common/decorators/public.decorator';
import { PublicService } from './public.service';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Public()
  @Get('firms/:slug')
  async branding(@Param('slug') slug: string): Promise<FirmBranding> {
    return this.publicService.branding(slug);
  }
}
