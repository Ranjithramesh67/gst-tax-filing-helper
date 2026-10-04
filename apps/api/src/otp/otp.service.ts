import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role } from '@gstflow/types';
import type { OtpIngestItem, OtpIngestResponse } from '@gstflow/types';

import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import type { Actor } from '../common/auth/actor.types';
import { resolveActiveLinkTargets } from './link-targets';

const SETTINGS_KEY = 'otp.settings';
const DEFAULT_GROUP_WINDOW_SECONDS = 300;

interface StoredOtpSettings {
  groupWindowSeconds?: number;
  emailEnabled?: boolean;
  providersEnabled?: Record<string, boolean>;
}

/**
 * Decides whether a newly seen OTP belongs to the same group as the previous
 * event for that client + code. Groups collapse identical codes received within
 * a rolling window (the group id is the first event's id). Returns the existing
 * group id to reuse, or null to start a new group.
 */
export function groupKeyFor(
  previous: { id: string; receivedAt: Date } | null,
  receivedAt: Date,
  windowSeconds: number,
): string | null {
  if (!previous) return null;
  const delta = Math.abs(receivedAt.getTime() - previous.receivedAt.getTime());
  return delta <= windowSeconds * 1000 ? previous.id : null;
}

export interface RecordOtpFromSmsInput {
  firmId: string;
  clientId: string;
  deviceId: string | null;
  code: string;
  snippet: string;
  receivedAt: Date;
  /** Always non-null. For SMS this is the created SmsMessage id. */
  sourceRef: string;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Grouping window in seconds from `otp.settings`, defaulting to 300. */
  async groupWindowSeconds(): Promise<number> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEY } });
    const stored = (row?.value as StoredOtpSettings | null) ?? {};
    const seconds = Number(stored.groupWindowSeconds);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_GROUP_WINDOW_SECONDS;
  }

  private async resolveGroup(
    firmId: string,
    clientId: string,
    code: string,
    receivedAt: Date,
  ): Promise<string | null> {
    const windowSeconds = await this.groupWindowSeconds();
    const previous = await this.prisma.otpEvent.findFirst({
      where: { firmId, clientId, code, groupId: { not: null } },
      orderBy: { receivedAt: 'desc' },
      select: { groupId: true, receivedAt: true },
    });
    return groupKeyFor(
      previous ? { id: previous.groupId!, receivedAt: previous.receivedAt } : null,
      receivedAt,
      windowSeconds,
    );
  }

  /**
   * Persists an OTP mined from an ingested SMS. Idempotent on
   * (clientId, source, sourceRef): a duplicate insert is swallowed so replaying
   * ingest never fails. Snippets are encrypted at rest.
   */
  async recordFromSms(input: RecordOtpFromSmsInput): Promise<void> {
    const groupId =
      (await this.resolveGroup(input.firmId, input.clientId, input.code, input.receivedAt)) ??
      undefined;
    try {
      const created = await this.prisma.otpEvent.create({
        data: {
          firmId: input.firmId,
          clientId: input.clientId,
          deviceId: input.deviceId,
          code: input.code,
          source: 'SMS',
          fromAddress: null,
          subject: null,
          snippet: this.crypto.encrypt(input.snippet),
          receivedAt: input.receivedAt,
          sourceRef: input.sourceRef,
          groupId: groupId ?? undefined,
        },
        select: { id: true, groupId: true },
      });
      if (!created.groupId) {
        await this.prisma.otpEvent.update({
          where: { id: created.id },
          data: { groupId: created.id },
        });
      }
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }
  }

  /**
   * Persists OTPs mined from ingested email events. Identical consent and
   * firm-scoping rules to SMS ingest: one event per ACTIVE linked firm, grouped
   * by code within the rolling window. Idempotent on
   * (clientId, source, sourceRef) — replays are reported as duplicates.
   */
  async recordEmailEvents(actor: Actor, items: OtpIngestItem[]): Promise<OtpIngestResponse> {
    const clientId = actor.clientId;
    if (actor.role !== Role.CLIENT || !clientId) {
      throw new ForbiddenException('No client is associated with this account');
    }

    const targets = await resolveActiveLinkTargets(this.prisma, clientId);
    const targetIds = targets.map((target) => target.id);
    const firmOfClient = new Map(targets.map((target) => [target.id, target.firmId]));

    const deviceByKey = await this.resolveDevices(targetIds, items);

    let accepted = 0;
    let duplicates = 0;
    let rejected = 0;
    const ids: string[] = [];

    for (const item of items) {
      const itemDevice = item.deviceId ? deviceByKey.get(item.deviceId) : undefined;
      if (item.deviceId && !itemDevice) {
        rejected += 1;
        continue;
      }

      const receivedAt = new Date(item.receivedAt);
      if (Number.isNaN(receivedAt.getTime())) {
        rejected += 1;
        continue;
      }

      let createdAny = false;
      let duplicateOnly = true;
      for (const targetId of targetIds) {
        const deviceId = itemDevice && itemDevice.clientId === targetId ? itemDevice.id : null;
        try {
          const created = await this.createEmailEvent({
            firmId: firmOfClient.get(targetId)!,
            clientId: targetId,
            deviceId,
            item,
            receivedAt,
          });
          createdAny = true;
          duplicateOnly = false;
          ids.push(created.id);
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            // Already stored for this firm; not an error.
          } else {
            this.logger.error(`Failed to ingest OTP email event: ${String(error)}`);
            duplicateOnly = false;
          }
        }
      }

      if (createdAny) accepted += 1;
      else if (duplicateOnly) duplicates += 1;
      else rejected += 1;
    }

    return { accepted, duplicates, rejected, ids };
  }

  private async createEmailEvent(input: {
    firmId: string;
    clientId: string;
    deviceId: string | null;
    item: OtpIngestItem;
    receivedAt: Date;
  }): Promise<{ id: string }> {
    const groupId =
      (await this.resolveGroup(
        input.firmId,
        input.clientId,
        input.item.code,
        input.receivedAt,
      )) ?? undefined;
    const created = await this.prisma.otpEvent.create({
      data: {
        firmId: input.firmId,
        clientId: input.clientId,
        deviceId: input.deviceId,
        code: input.item.code,
        source: 'EMAIL',
        fromAddress: input.item.fromAddress ?? null,
        subject: input.item.subject ?? null,
        snippet: input.item.snippet != null ? this.crypto.encrypt(input.item.snippet) : null,
        receivedAt: input.receivedAt,
        sourceRef: input.item.sourceRef,
        groupId,
      },
      select: { id: true, groupId: true },
    });
    if (!created.groupId) {
      await this.prisma.otpEvent.update({
        where: { id: created.id },
        data: { groupId: created.id },
      });
    }
    return created;
  }

  /**
   * Maps client-supplied Device ids / hardware androidIds to the canonical
   * Device and its owning client, so only devices owned by a linked firm's
   * client can be attached. Unknown keys simply resolve to nothing.
   */
  private async resolveDevices(
    targetIds: string[],
    items: OtpIngestItem[],
  ): Promise<Map<string, { id: string; clientId: string }>> {
    const deviceByKey = new Map<string, { id: string; clientId: string }>();
    const deviceIds = [
      ...new Set(items.map((item) => item.deviceId).filter((id): id is string => Boolean(id))),
    ];
    if (deviceIds.length === 0) return deviceByKey;

    const devices = await this.prisma.device.findMany({
      where: {
        clientId: { in: targetIds },
        revoked: false,
        OR: [{ id: { in: deviceIds } }, { androidId: { in: deviceIds } }],
      },
      select: { id: true, androidId: true, clientId: true },
    });
    for (const device of devices) {
      deviceByKey.set(device.id, { id: device.id, clientId: device.clientId });
      deviceByKey.set(device.androidId, { id: device.id, clientId: device.clientId });
    }
    return deviceByKey;
  }

  /** Decrypts an OTP snippet for reads. Plaintext/legacy values pass through. */
  decryptSnippet(snippet: string | null): string | null {
    if (snippet == null) return null;
    return this.crypto.decrypt(snippet);
  }
}
