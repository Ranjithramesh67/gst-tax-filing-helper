import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { AppNotification, Paginated, UnreadCountResponse } from '@gstflow/types';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { Actor } from '../common/auth/actor.types';
import { NotificationsService } from './notifications.service';
import type { ListNotificationsQuery } from './dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Query() query: ListNotificationsQuery,
    @CurrentUser() actor: Actor,
  ): Promise<Paginated<AppNotification>> {
    return this.notifications.list(actor, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() actor: Actor): Promise<UnreadCountResponse> {
    return this.notifications.unreadCount(actor);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() actor: Actor): Promise<{ updated: number }> {
    return this.notifications.markAllRead(actor);
  }

  @Post(':id/read')
  markRead(
    @Param('id') id: string,
    @CurrentUser() actor: Actor,
  ): Promise<AppNotification> {
    return this.notifications.markRead(actor, id);
  }
}
