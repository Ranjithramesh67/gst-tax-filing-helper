import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { Firm } from '@gstflow/types';
import { updateFirmSettingsSchema } from '@gstflow/validation';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { FirmService } from './firm.service';
import type { UpdateFirmSettingsInput } from './dto';

@Controller('firm/profile')
export class FirmController {
  constructor(private readonly firm: FirmService) {}

  @Get()
  @RequirePermissions('firm:read')
  getProfile(@CurrentUser() actor: Actor): Promise<Firm> {
    return this.firm.getProfile(actor);
  }

  @Patch()
  @RequirePermissions('firm:manage')
  updateProfile(
    @Body(new ZodValidationPipe(updateFirmSettingsSchema)) body: UpdateFirmSettingsInput,
    @CurrentUser() actor: Actor,
  ): Promise<Firm> {
    return this.firm.updateProfile(body, actor);
  }
}
