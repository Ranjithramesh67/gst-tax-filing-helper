import { Controller, Get, Query } from '@nestjs/common';
import type { PaginatedAudit } from '@gstflow/types';

import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { AdminService } from './admin.service';
import { listAuditQuerySchema, type ListAuditQuery } from './dto';

@Controller('admin/audit')
export class AuditController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @RequirePermissions('audit:read')
  async list(
    @Query(new ZodValidationPipe(listAuditQuerySchema)) query: ListAuditQuery,
    @CurrentUser() actor: Actor,
  ): Promise<PaginatedAudit> {
    return this.admin.listAudit(query, actor);
  }
}
