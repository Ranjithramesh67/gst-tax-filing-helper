import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AppNotification, Paginated, UnreadCountResponse } from '@gstflow/types';

import { paginate, parsePagination } from '../common/pagination';
import { serialiseNotification } from '../common/serializers';
import { isClientActor, type Actor } from '../common/auth/actor.types';
import { PrismaService } from '../prisma/prisma.service';
import type { ListNotificationsQuery } from './dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Restricts the feed to what the actor may see. */
  private scope(actor: Actor): Prisma.NotificationWhereInput {
    if (isClientActor(actor)) {
      return { clientId: actor.clientId ?? '__none__' };
    }
    if (!actor.firmId) return { id: '__none__' };
    return {
      firmId: actor.firmId,
      OR: [{ userId: null }, { userId: actor.userId }],
    };
  }

  async list(actor: Actor, query: ListNotificationsQuery): Promise<Paginated<AppNotification>> {
    const slice = parsePagination({
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    });
    const where: Prisma.NotificationWhereInput = { ...this.scope(actor) };
    const unreadOnly = query.unreadOnly === true || query.unreadOnly === 'true';
    if (unreadOnly) where.readAt = null;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: slice.skip,
        take: slice.take,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginate(rows.map(serialiseNotification), total, slice);
  }

  async unreadCount(actor: Actor): Promise<UnreadCountResponse> {
    const count = await this.prisma.notification.count({
      where: { AND: [this.scope(actor), { readAt: null }] },
    });
    return { count };
  }

  async markRead(actor: Actor, id: string): Promise<AppNotification> {
    const existing = await this.prisma.notification.findFirst({
      where: { AND: [this.scope(actor), { id }] },
    });
    if (!existing) throw new NotFoundException('Notification not found');
    const updated = existing.readAt
      ? existing
      : await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    return serialiseNotification(updated);
  }

  async markAllRead(actor: Actor): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { AND: [this.scope(actor), { readAt: null }] },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
