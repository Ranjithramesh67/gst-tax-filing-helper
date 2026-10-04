import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { SmsProviderConfig, SmsTestReport } from '@gstflow/types';
import { smsProviderInputSchema, smsTestSchema, updateSmsProviderSchema } from '@gstflow/validation';

import { RequireSuperAdmin } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { SmsProviderConfigService } from '../common/sms/sms-provider-config.service';
import type {
  CreateSmsProviderInput,
  TestSmsProviderInput,
  UpdateSmsProviderInput,
} from './dto';

@Controller('admin/sms-providers')
@RequireSuperAdmin()
export class SmsProvidersController {
  constructor(private readonly providers: SmsProviderConfigService) {}

  @Get()
  async list(): Promise<SmsProviderConfig[]> {
    return this.providers.list();
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<SmsProviderConfig> {
    return this.providers.get(id);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(smsProviderInputSchema)) body: CreateSmsProviderInput,
    @CurrentUser() actor: Actor,
  ): Promise<SmsProviderConfig> {
    return this.providers.create(body, actor);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSmsProviderSchema)) body: UpdateSmsProviderInput,
    @CurrentUser() actor: Actor,
  ): Promise<SmsProviderConfig> {
    return this.providers.update(id, body, actor);
  }

  @Post(':id/activate')
  async activate(
    @Param('id') id: string,
    @CurrentUser() actor: Actor,
  ): Promise<SmsProviderConfig> {
    return this.providers.activate(id, actor);
  }

  @Post('test')
  async test(
    @Body(new ZodValidationPipe(smsTestSchema)) body: TestSmsProviderInput,
    @CurrentUser() actor: Actor,
  ): Promise<SmsTestReport> {
    return this.providers.test(body, actor);
  }
}
