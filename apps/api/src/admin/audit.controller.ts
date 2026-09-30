import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@gstflow/types';
import type { PaginatedAudit } from '@gstflow/types';

import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { AdminService } from './admin.service';
import { listAuditQuerySchema, type ListAuditQuery } from './dto';

@Controller('admin/audit')
@Roles(Role.SUPER_ADMIN, Role.FIRM_ADMIN, Role.FILER)
export class AuditController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listAuditQuerySchema)) query: ListAuditQuery,
    @CurrentUser() actor: Actor,
  ): Promise<PaginatedAudit> {
    return this.admin.listAudit(query, actor);
  }
}
