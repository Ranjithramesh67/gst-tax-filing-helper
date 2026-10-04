import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';

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
    clientId: string,
    code: string,
    receivedAt: Date,
  ): Promise<string | null> {
    const windowSeconds = await this.groupWindowSeconds();
    const previous = await this.prisma.otpEvent.findFirst({
      where: { clientId, code, groupId: { not: null } },
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
      (await this.resolveGroup(input.clientId, input.code, input.receivedAt)) ?? undefined;
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

  /** Decrypts an OTP snippet for reads. Plaintext/legacy values pass through. */
  decryptSnippet(snippet: string | null): string | null {
    if (snippet == null) return null;
    return this.crypto.decrypt(snippet);
  }
}
