import { Body, Controller, Get, Put } from '@nestjs/common';
import type { OtpSettingsConfig } from '@gstflow/types';

import { RequireSuperAdmin } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { OtpSettingsService } from './otp-settings.service';
import { otpSettingsSchema, type UpdateOtpSettingsInput } from './dto';

@Controller('admin/settings/otp')
@RequireSuperAdmin()
export class OtpSettingsController {
  constructor(private readonly otpSettings: OtpSettingsService) {}

  @Get()
  async get(): Promise<OtpSettingsConfig> {
    return this.otpSettings.getConfig();
  }

  @Put()
  async update(
    @Body(new ZodValidationPipe(otpSettingsSchema)) body: UpdateOtpSettingsInput,
    @CurrentUser() actor: Actor,
  ): Promise<OtpSettingsConfig> {
    return this.otpSettings.updateConfig(body, actor);
  }
}
