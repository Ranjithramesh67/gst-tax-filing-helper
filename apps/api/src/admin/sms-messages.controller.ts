import { Controller, Get, Query } from '@nestjs/common';
import type { PaginatedAdminSms } from '@gstflow/types';

import { RequireSuperAdmin } from '../common/decorators/permissions.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminSmsService } from './admin-sms.service';
import { listSmsQuerySchema, type ListSmsQuery } from './dto';

@Controller('admin/sms')
@RequireSuperAdmin()
export class AdminSmsController {
  constructor(private readonly sms: AdminSmsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listSmsQuerySchema)) query: ListSmsQuery,
  ): Promise<PaginatedAdminSms> {
    return this.sms.list(query);
  }
}
