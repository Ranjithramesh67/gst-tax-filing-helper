import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@gstflow/types';
import type {
  ClassifySmsBody,
  PaginatedSms,
  SmsIngestBody,
  SmsIngestResponse,
  SmsMessage,
} from '@gstflow/types';
import { classifySmsSchema, smsIngestSchema } from '@gstflow/validation';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { SmsService } from './sms.service';
import type { SmsListQueryDto } from './dto';

@Controller('sms')
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  @Post('ingest')
  @Roles(Role.CLIENT)
  async ingest(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(smsIngestSchema)) body: SmsIngestBody,
  ): Promise<SmsIngestResponse> {
    return this.sms.ingest(actor, body);
  }

  @Get()
  @RequirePermissions('sms:read')
  async list(
    @CurrentUser() actor: Actor,
    @Query() query: SmsListQueryDto,
  ): Promise<PaginatedSms> {
    return this.sms.list(actor, query);
  }

  @Get(':id')
  @RequirePermissions('sms:read')
  async getById(@CurrentUser() actor: Actor, @Param('id') id: string): Promise<SmsMessage> {
    return this.sms.getById(actor, id);
  }

  @Post(':id/classify')
  @RequirePermissions('sms:classify')
  async classify(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(classifySmsSchema)) body: ClassifySmsBody,
  ): Promise<SmsMessage> {
    return this.sms.classify(actor, id, body);
  }
}
