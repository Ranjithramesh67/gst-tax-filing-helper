import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import type {
  SmsRetentionPolicy,
  SmsRetentionPreview,
  SmsRetentionRunResult,
} from '@gstflow/types';

import { RequireSuperAdmin } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { RetentionService } from './retention.service';
import { smsRetentionSchema, type UpdateSmsRetentionInput } from './dto';

@Controller('admin/settings/sms-retention')
@RequireSuperAdmin()
export class SettingsController {
  constructor(private readonly retention: RetentionService) {}

  @Get()
  async get(): Promise<SmsRetentionPolicy> {
    return this.retention.getPolicy();
  }

  @Get('preview')
  async preview(): Promise<SmsRetentionPreview> {
    return this.retention.preview();
  }

  @Put()
  async update(
    @Body(new ZodValidationPipe(smsRetentionSchema)) body: UpdateSmsRetentionInput,
    @CurrentUser() actor: Actor,
  ): Promise<SmsRetentionPolicy> {
    return this.retention.updatePolicy(body, actor);
  }

  @Post('run')
  async run(@CurrentUser() actor: Actor): Promise<SmsRetentionRunResult> {
    return this.retention.run(actor, true);
  }
}
