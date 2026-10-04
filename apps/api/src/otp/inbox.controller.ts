import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@gstflow/types';
import type { InboxGroupDetail, PaginatedInbox } from '@gstflow/types';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { Actor } from '../common/auth/actor.types';
import type { InboxListQueryDto } from './dto';
import { OtpService } from './otp.service';

@Controller('inbox')
export class InboxController {
  constructor(private readonly otp: OtpService) {}

  @Get()
  @Roles(Role.CLIENT, Role.FIRM_ADMIN, Role.FILER, Role.SUPER_ADMIN)
  async list(
    @CurrentUser() actor: Actor,
    @Query() query: InboxListQueryDto,
  ): Promise<PaginatedInbox> {
    return this.otp.listFeed(actor, query);
  }

  @Get(':id')
  @Roles(Role.CLIENT, Role.FIRM_ADMIN, Role.FILER, Role.SUPER_ADMIN)
  async group(
    @CurrentUser() actor: Actor,
    @Param('id') id: string,
  ): Promise<InboxGroupDetail> {
    return this.otp.getGroup(actor, id);
  }
}
