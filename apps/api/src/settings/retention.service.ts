import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  SmsRetentionPolicy,
  SmsRetentionPreview,
  SmsRetentionRunResult,
} from '@gstflow/types';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../common/auth/actor.types';

const POLICY_KEY = 'sms.retention';
const DAY_MS = 86_400_000;
const ARCHIVE_BATCH = 500;

const DEFAULT_POLICY = {
  enabled: false,
  archiveAfterDays: 180,
  purgeBackupAfterDays: 365,
} as const;

interface StoredPolicy {
  enabled: boolean;
  archiveAfterDays: number;
  purgeBackupAfterDays: number;
}

// Moves SMS messages older than the retention window out of the live inbox into
// the encrypted archive table (removing them from firm and client views), then
// hard-deletes archived rows once their backup window expires.
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer?: NodeJS.Timeout;
  private initialTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    if (process.env.RETENTION_ENABLED === 'false') return;
    const interval = Number(process.env.RETENTION_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
    const initialDelay = Number(process.env.RETENTION_INITIAL_DELAY_MS ?? 60_000);

    this.initialTimer = setTimeout(() => void this.safeScheduledRun(), initialDelay);
    this.initialTimer.unref?.();
    this.timer = setInterval(() => void this.safeScheduledRun(), interval);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.initialTimer) clearTimeout(this.initialTimer);
  }

  private async safeScheduledRun(): Promise<void> {
    try {
      const result = await this.run(null, false);
      if (result.archived > 0 || result.purged > 0) {
        this.logger.log(
          `Retention run archived ${result.archived} and purged ${result.purged} message(s)`,
        );
      }
    } catch (error) {
      this.logger.error(`Retention run failed: ${(error as Error).message}`);
    }
  }

  async getPolicy(): Promise<SmsRetentionPolicy> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: POLICY_KEY } });
    const stored = (row?.value as Partial<StoredPolicy> | null) ?? {};
    return {
      enabled: stored.enabled ?? DEFAULT_POLICY.enabled,
      archiveAfterDays: stored.archiveAfterDays ?? DEFAULT_POLICY.archiveAfterDays,
      purgeBackupAfterDays: stored.purgeBackupAfterDays ?? DEFAULT_POLICY.purgeBackupAfterDays,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  async updatePolicy(input: StoredPolicy, actor: Actor): Promise<SmsRetentionPolicy> {
    const value: StoredPolicy = {
      enabled: input.enabled,
      archiveAfterDays: input.archiveAfterDays,
      purgeBackupAfterDays: input.purgeBackupAfterDays,
    };
    const json = value as unknown as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({
      where: { key: POLICY_KEY },
      create: { key: POLICY_KEY, value: json, updatedById: actor.userId },
      update: { value: json, updatedById: actor.userId },
    });
    await this.audit.recordAs(actor, {
      action: 'settings.smsRetention.update',
      entity: 'SystemSetting',
      entityId: POLICY_KEY,
      meta: { ...value },
    });
    return this.getPolicy();
  }

  async preview(): Promise<SmsRetentionPreview> {
    const policy = await this.getPolicy();
    const now = new Date();
    const archiveCutoff = new Date(now.getTime() - policy.archiveAfterDays * DAY_MS);

    const [liveCount, archiveCandidates, archivedCount, purgeCandidates] =
      await this.prisma.$transaction([
        this.prisma.smsMessage.count(),
        this.prisma.smsMessage.count({ where: { receivedAt: { lt: archiveCutoff } } }),
        this.prisma.smsMessageArchive.count(),
        this.prisma.smsMessageArchive.count({ where: { purgeAt: { lte: now } } }),
      ]);

    return { liveCount, archiveCandidates, archivedCount, purgeCandidates, policy };
  }

  async run(actor: Actor | null, force = false): Promise<SmsRetentionRunResult> {
    if (this.running) {
      const policy = await this.getPolicy();
      return { archived: 0, purged: 0, policy };
    }
    this.running = true;
    try {
      const policy = await this.getPolicy();
      if (!policy.enabled && !force) {
        return { archived: 0, purged: 0, policy };
      }

      const archived = await this.archiveOlderThan(
        policy.archiveAfterDays,
        policy.purgeBackupAfterDays,
      );
      const purged = await this.purgeExpired();

      if (actor) {
        await this.audit.recordAs(actor, {
          action: 'settings.smsRetention.run',
          entity: 'SystemSetting',
          entityId: POLICY_KEY,
          meta: { archived, purged, forced: force },
        });
      }
      return { archived, purged, policy };
    } finally {
      this.running = false;
    }
  }

  private async archiveOlderThan(days: number, backupDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * DAY_MS);
    let total = 0;

    for (;;) {
      const rows = await this.prisma.smsMessage.findMany({
        where: { receivedAt: { lt: cutoff } },
        include: { parsed: true },
        take: ARCHIVE_BATCH,
        orderBy: { receivedAt: 'asc' },
      });
      if (rows.length === 0) break;

      const archivedAt = new Date();
      const purgeAt = new Date(archivedAt.getTime() + backupDays * DAY_MS);

      await this.prisma.$transaction([
        this.prisma.smsMessageArchive.createMany({
          data: rows.map((row) => ({
            originalId: row.id,
            clientId: row.clientId,
            deviceId: row.deviceId,
            sender: row.sender,
            bodyEncrypted: row.bodyEncrypted,
            receivedAt: row.receivedAt,
            category: row.category,
            status: row.status,
            hash: row.hash,
            parsed: row.parsed
              ? (JSON.parse(JSON.stringify(row.parsed)) as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            archivedAt,
            purgeAt,
          })),
        }),
        this.prisma.smsMessage.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } }),
      ]);

      total += rows.length;
      if (rows.length < ARCHIVE_BATCH) break;
    }

    return total;
  }

  private async purgeExpired(): Promise<number> {
    const result = await this.prisma.smsMessageArchive.deleteMany({
      where: { purgeAt: { lte: new Date() } },
    });
    return result.count;
  }
}
