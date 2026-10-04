import { Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@gstflow/types';
import type { ClientLink } from '@gstflow/types';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { Actor } from '../common/auth/actor.types';
import { LinksService } from './links.service';

@Controller('client')
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Get('links')
  @Roles(Role.CLIENT)
  list(@CurrentUser() actor: Actor): Promise<ClientLink[]> {
    return this.links.list(actor);
  }

  @Post('links/:id/confirm')
  @Roles(Role.CLIENT)
  confirm(@CurrentUser() actor: Actor, @Param('id') id: string): Promise<ClientLink> {
    return this.links.confirm(actor, id);
  }

  @Post('links/:id/reject')
  @Roles(Role.CLIENT)
  reject(@CurrentUser() actor: Actor, @Param('id') id: string): Promise<ClientLink> {
    return this.links.reject(actor, id);
  }

  @Post('links/:id/revoke')
  @Roles(Role.CLIENT)
  revoke(@CurrentUser() actor: Actor, @Param('id') id: string): Promise<ClientLink> {
    return this.links.revoke(actor, id);
  }
}
