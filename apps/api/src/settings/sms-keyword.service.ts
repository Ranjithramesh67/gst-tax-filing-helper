import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SmsKeywordConfig } from '@gstflow/types';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../common/auth/actor.types';

const CONFIG_KEY = 'sms.keywords';

const DEFAULT_CONFIG = {
  bodyKeywords: ['gst'],
  headerKeywords: [] as string[],
  hideAfterForward: false,
} as const;

interface StoredConfig {
  bodyKeywords: string[];
  headerKeywords: string[];
  hideAfterForward: boolean;
}

// Trims, drops blanks and de-duplicates keywords case-insensitively while keeping
// the casing the super admin entered (matching is case-insensitive on-device).
function normaliseKeywords(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const value = item.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

@Injectable()
export class SmsKeywordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getConfig(): Promise<SmsKeywordConfig> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: CONFIG_KEY } });
    const stored = (row?.value as Partial<StoredConfig> | null) ?? {};
    return {
      bodyKeywords: stored.bodyKeywords ?? [...DEFAULT_CONFIG.bodyKeywords],
      headerKeywords: stored.headerKeywords ?? [...DEFAULT_CONFIG.headerKeywords],
      hideAfterForward: stored.hideAfterForward ?? DEFAULT_CONFIG.hideAfterForward,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  async updateConfig(input: StoredConfig, actor: Actor): Promise<SmsKeywordConfig> {
    const value: StoredConfig = {
      bodyKeywords: normaliseKeywords(input.bodyKeywords),
      headerKeywords: normaliseKeywords(input.headerKeywords),
      hideAfterForward: input.hideAfterForward,
    };
    const json = value as unknown as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({
      where: { key: CONFIG_KEY },
      create: { key: CONFIG_KEY, value: json, updatedById: actor.userId },
      update: { value: json, updatedById: actor.userId },
    });
    await this.audit.recordAs(actor, {
      action: 'settings.smsKeywords.update',
      entity: 'SystemSetting',
      entityId: CONFIG_KEY,
      meta: { ...value },
    });
    return this.getConfig();
  }
}
