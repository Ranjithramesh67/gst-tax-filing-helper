import { Body, Controller, Post } from '@nestjs/common';
import { Role } from '@gstflow/types';
import type { OtpIngestBody, OtpIngestResponse } from '@gstflow/types';
import { otpIngestSchema } from '@gstflow/validation';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { OtpService } from './otp.service';

@Controller('otp')
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @Post('ingest')
  @Roles(Role.CLIENT)
  async ingest(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(otpIngestSchema)) body: OtpIngestBody,
  ): Promise<OtpIngestResponse> {
    return this.otp.recordEmailEvents(actor, body.items);
  }
}
