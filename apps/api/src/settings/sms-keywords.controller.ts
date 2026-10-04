import { Body, Controller, Get, Put } from '@nestjs/common';
import type { SmsKeywordConfig } from '@gstflow/types';

import { RequireSuperAdmin } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { SmsKeywordService } from './sms-keyword.service';
import { smsKeywordSchema, type UpdateSmsKeywordInput } from './dto';

@Controller('admin/settings/sms-keywords')
@RequireSuperAdmin()
export class SmsKeywordsController {
  constructor(private readonly keywords: SmsKeywordService) {}

  @Get()
  async get(): Promise<SmsKeywordConfig> {
    return this.keywords.getConfig();
  }

  @Put()
  async update(
    @Body(new ZodValidationPipe(smsKeywordSchema)) body: UpdateSmsKeywordInput,
    @CurrentUser() actor: Actor,
  ): Promise<SmsKeywordConfig> {
    return this.keywords.updateConfig(body, actor);
  }
}
