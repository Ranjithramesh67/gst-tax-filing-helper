import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OtpSettingsConfig, OtpProvidersEnabled } from '@gstflow/types';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../common/auth/actor.types';

const CONFIG_KEY = 'otp.settings';
const MIN_GROUP_WINDOW_SECONDS = 30;
const MAX_GROUP_WINDOW_SECONDS = 3600;

const DEFAULT_CONFIG = {
  groupWindowSeconds: 300,
  emailEnabled: true,
  providersEnabled: { imap: true, gmail: true, graph: true },
} as const;

const PROVIDER_KEYS = ['imap', 'gmail', 'graph'] as const;

interface StoredConfig {
  groupWindowSeconds?: number;
  emailEnabled?: boolean;
  providersEnabled?: Partial<OtpProvidersEnabled>;
}

export interface OtpSettingsInput {
  groupWindowSeconds: number;
  emailEnabled: boolean;
  providersEnabled: OtpProvidersEnabled;
}

// Coerces any stored/supplied window to a whole number of seconds within
// [30, 3600], falling back to the default when it is not a finite number. The
// setting is validated at the API boundary too, but legacy or hand-edited rows
// must never yield a nonsensical grouping window.
function clampGroupWindowSeconds(value: unknown): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return DEFAULT_CONFIG.groupWindowSeconds;
  const whole = Math.trunc(seconds);
  return Math.min(MAX_GROUP_WINDOW_SECONDS, Math.max(MIN_GROUP_WINDOW_SECONDS, whole));
}

function normaliseConfig(input: StoredConfig): OtpSettingsConfig {
  const providers = input.providersEnabled ?? {};
  const providersEnabled = {} as OtpProvidersEnabled;
  for (const key of PROVIDER_KEYS) {
    providersEnabled[key] = providers[key] ?? DEFAULT_CONFIG.providersEnabled[key];
  }
  return {
    groupWindowSeconds: clampGroupWindowSeconds(input.groupWindowSeconds),
    emailEnabled: input.emailEnabled ?? DEFAULT_CONFIG.emailEnabled,
    providersEnabled,
  };
}

@Injectable()
export class OtpSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getConfig(): Promise<OtpSettingsConfig> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: CONFIG_KEY } });
    const stored = (row?.value as StoredConfig | null) ?? {};
    return { ...normaliseConfig(stored), updatedAt: row?.updatedAt?.toISOString() ?? null };
  }

  async updateConfig(input: OtpSettingsInput, actor: Actor): Promise<OtpSettingsConfig> {
    const value = normaliseConfig(input);
    const json = value as unknown as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({
      where: { key: CONFIG_KEY },
      create: { key: CONFIG_KEY, value: json, updatedById: actor.userId },
      update: { value: json, updatedById: actor.userId },
    });
    await this.audit.recordAs(actor, {
      action: 'settings.otp.update',
      entity: 'SystemSetting',
      entityId: CONFIG_KEY,
      meta: { ...value },
    });
    return this.getConfig();
  }
}
