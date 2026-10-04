import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;

interface ReminderBucket {
  type: string;
  label: string;
}

function bucketFor(daysUntil: number): ReminderBucket | null {
  if (daysUntil < 0) return { type: 'RETURN_OVERDUE', label: 'overdue' };
  if (daysUntil <= 1) return { type: 'RETURN_DUE_1D', label: 'due in 1 day' };
  if (daysUntil <= 3) return { type: 'RETURN_DUE_3D', label: 'due in 3 days' };
  if (daysUntil <= 7) return { type: 'RETURN_DUE_7D', label: 'due in 7 days' };
  return null;
}

function formatDate(value: Date): string {
  return value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersService.name);
  private timer?: NodeJS.Timeout;
  private initialTimer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (process.env.REMINDERS_ENABLED === 'false') return;
    const interval = Number(process.env.REMINDER_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
    const initialDelay = Number(process.env.REMINDER_INITIAL_DELAY_MS ?? 15_000);

    this.initialTimer = setTimeout(() => void this.safeGenerate(), initialDelay);
    this.initialTimer.unref?.();
    this.timer = setInterval(() => void this.safeGenerate(), interval);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.initialTimer) clearTimeout(this.initialTimer);
  }

  private async safeGenerate(): Promise<void> {
    try {
      const created = await this.generate();
      if (created > 0) this.logger.log(`Generated ${created} deadline reminder(s)`);
    } catch (error) {
      this.logger.error(`Reminder generation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Scans open returns with a due date and creates one notification per
   * due-date bucket. Deduplicated by the (firmId, dedupeKey) unique index so
   * repeated runs never create duplicates. Returns the number created.
   */
  async generate(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    const startedAt = new Date();
    try {
      const returns = await this.prisma.gstReturn.findMany({
        where: { status: { not: 'FILED' }, dueDate: { not: null } },
        select: {
          id: true,
          type: true,
          period: true,
          dueDate: true,
          client: { select: { id: true, name: true, firmId: true } },
        },
      });

      const now = Date.now();
      const rows: Prisma.NotificationCreateManyInput[] = [];

      for (const item of returns) {
        if (!item.dueDate) continue;
        const daysUntil = Math.ceil((item.dueDate.getTime() - now) / DAY_MS);
        const bucket = bucketFor(daysUntil);
        if (!bucket) continue;

        rows.push({
          firmId: item.client.firmId,
          userId: null,
          clientId: null,
          type: bucket.type,
          title: `${item.type} ${item.period} ${bucket.label}`,
          body: `${item.client.name}'s ${item.type} return for ${item.period} is ${bucket.label} (due ${formatDate(item.dueDate)}).`,
          entity: 'GstReturn',
          entityId: item.id,
          dedupeKey: `${item.id}:${bucket.type}`,
          meta: {
            clientId: item.client.id,
            clientName: item.client.name,
            returnType: item.type,
            period: item.period,
            dueDate: item.dueDate.toISOString(),
            daysUntil,
          },
        });
      }

      if (rows.length === 0) return 0;

      const result = await this.prisma.notification.createMany({
        data: rows,
        skipDuplicates: true,
      });

      if (result.count > 0) {
        await this.dispatch(rows, startedAt);
      }
      return result.count;
    } finally {
      this.running = false;
    }
  }

  /** Best-effort outbound delivery; only active when NOTIFY_WEBHOOK_URL is set. */
  private async dispatch(rows: Prisma.NotificationCreateManyInput[], startedAt: Date): Promise<void> {
    const webhookUrl = process.env.NOTIFY_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      const created = await this.prisma.notification.findMany({
        where: {
          dedupeKey: { in: rows.map((row) => row.dedupeKey as string) },
          createdAt: { gte: startedAt },
        },
      });
      await Promise.all(
        created.map(async (notification) => {
          try {
            await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: notification.id,
                firmId: notification.firmId,
                type: notification.type,
                title: notification.title,
                body: notification.body,
                createdAt: notification.createdAt.toISOString(),
              }),
            });
          } catch (error) {
            this.logger.warn(`Webhook delivery failed: ${(error as Error).message}`);
          }
        }),
      );
    } catch (error) {
      this.logger.warn(`Webhook dispatch skipped: ${(error as Error).message}`);
    }
  }
}
