import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  SmsProviderConfig,
  SmsProviderKind,
  SmsTestReport,
  SmsTestResult,
} from '@gstflow/types';

import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuditService } from '../audit/audit.service';
import { serialiseSmsProvider } from '../serializers';
import type { Actor } from '../auth/actor.types';
import {
  buildPing4SmsRequest,
  renderSmsMessage,
  type Ping4SmsRequest,
} from './sms-provider.util';
import type { SmsSendResult } from './sms-gateway.service';

const DEFAULT_TIMEOUT_MS = 8000;

export interface SmsProviderInput {
  name: string;
  provider?: SmsProviderKind;
  isActive?: boolean;
  url: string;
  method?: string;
  sender: string;
  route?: string;
  templateId?: string;
  header?: string;
  credentials?: Record<string, string>;
  messageTemplate: string;
  appName: string;
  variables?: Record<string, string>;
  timeoutMs?: number;
}

export interface SmsProviderUpdateInput {
  name?: string;
  provider?: SmsProviderKind;
  isActive?: boolean;
  url?: string;
  method?: string;
  sender?: string;
  route?: string;
  templateId?: string;
  header?: string;
  credentials?: Record<string, string>;
  messageTemplate?: string;
  appName?: string;
  variables?: Record<string, string>;
  timeoutMs?: number;
}

export interface SmsTestInput {
  numbers: string[];
  code?: string;
  providerId?: string;
  config?: SmsProviderUpdateInput;
}

interface ResolvedProvider {
  id: string;
  provider: SmsProviderKind;
  appName: string;
  messageTemplate: string;
  variables: Record<string, string> | null;
  timeoutMs: number;
  credentials: Record<string, string>;
  request: {
    url: string;
    method: string;
    sender: string;
    route: string | null;
    templateId: string | null;
    header: string | null;
    credentials: Record<string, string>;
  };
}

type ProviderRow = {
  id: string;
  name: string;
  provider: string;
  isActive: boolean;
  url: string;
  method: string;
  sender: string;
  route: string | null;
  templateId: string | null;
  header: string | null;
  credentials: string;
  messageTemplate: string;
  appName: string;
  variables: unknown;
  timeoutMs: number;
  createdAt: Date;
  updatedAt: Date;
  updatedById: string | null;
};

// Stores and resolves outbound SMS provider credentials. Secrets are encrypted
// at rest via CryptoService and never returned to clients. The active provider
// is the source of truth for OTP delivery; the env-based gateway in
// SmsGatewayService remains a fallback when no provider is configured.
@Injectable()
export class SmsProviderConfigService {
  private readonly logger = new Logger(SmsProviderConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  private encrypt(credentials: Record<string, string>): string {
    return this.crypto.encrypt(JSON.stringify(credentials));
  }

  private decrypt(payload: string): Record<string, string> {
    try {
      const parsed = JSON.parse(this.crypto.decrypt(payload)) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
      return {};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to decrypt SMS provider credentials: ${message}`);
      return {};
    }
  }

  private toPublic(row: ProviderRow): SmsProviderConfig {
    const keys = Object.keys(this.decrypt(row.credentials));
    return serialiseSmsProvider(row, keys);
  }

  private toResolved(row: ProviderRow): ResolvedProvider {
    const credentials = this.decrypt(row.credentials);
    return {
      id: row.id,
      provider: row.provider as SmsProviderKind,
      appName: row.appName,
      messageTemplate: row.messageTemplate,
      variables: (row.variables as Record<string, string> | null) ?? null,
      timeoutMs: row.timeoutMs || DEFAULT_TIMEOUT_MS,
      credentials,
      request: {
        url: row.url,
        method: row.method,
        sender: row.sender,
        route: row.route,
        templateId: row.templateId,
        header: row.header,
        credentials,
      },
    };
  }

  async list(): Promise<SmsProviderConfig[]> {
    const rows = await this.prisma.smsProviderConfig.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => this.toPublic(row as ProviderRow));
  }

  async get(id: string): Promise<SmsProviderConfig> {
    const row = await this.prisma.smsProviderConfig.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('SMS provider not found');
    return this.toPublic(row as ProviderRow);
  }

  private async requireRow(id: string): Promise<ProviderRow> {
    const row = await this.prisma.smsProviderConfig.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('SMS provider not found');
    return row as ProviderRow;
  }

  private async activateExclusive(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.smsProviderConfig.updateMany({
        where: { isActive: true, id: { not: id } },
        data: { isActive: false },
      }),
      this.prisma.smsProviderConfig.update({ where: { id }, data: { isActive: true } }),
    ]);
  }

  async create(input: SmsProviderInput, actor: Actor): Promise<SmsProviderConfig> {
    const count = await this.prisma.smsProviderConfig.count();
    const shouldActivate = input.isActive ?? count === 0;
    const row = await this.prisma.smsProviderConfig.create({
      data: {
        name: input.name,
        provider: input.provider ?? 'PING4SMS',
        isActive: false,
        url: input.url,
        method: input.method ?? 'GET',
        sender: input.sender,
        route: input.route ?? null,
        templateId: input.templateId ?? null,
        header: input.header ?? null,
        credentials: this.encrypt(input.credentials ?? {}),
        messageTemplate: input.messageTemplate,
        appName: input.appName,
        variables: input.variables ?? undefined,
        timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        updatedById: actor.userId,
      },
    });
    if (shouldActivate) await this.activateExclusive(row.id);
    await this.audit.recordAs(actor, {
      action: 'smsProvider.create',
      entity: 'SmsProviderConfig',
      entityId: row.id,
      meta: { name: input.name, provider: input.provider ?? 'PING4SMS', isActive: shouldActivate },
    });
    return this.get(row.id);
  }

  async update(id: string, input: SmsProviderUpdateInput, actor: Actor): Promise<SmsProviderConfig> {
    await this.requireRow(id);
    await this.prisma.smsProviderConfig.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.method !== undefined ? { method: input.method } : {}),
        ...(input.sender !== undefined ? { sender: input.sender } : {}),
        ...(input.route !== undefined ? { route: input.route } : {}),
        ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
        ...(input.header !== undefined ? { header: input.header } : {}),
        ...(input.credentials !== undefined
          ? { credentials: this.encrypt(input.credentials) }
          : {}),
        ...(input.messageTemplate !== undefined ? { messageTemplate: input.messageTemplate } : {}),
        ...(input.appName !== undefined ? { appName: input.appName } : {}),
        ...(input.variables !== undefined ? { variables: input.variables } : {}),
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedById: actor.userId,
      },
    });
    if (input.isActive === true) await this.activateExclusive(id);
    await this.audit.recordAs(actor, {
      action: 'smsProvider.update',
      entity: 'SmsProviderConfig',
      entityId: id,
      meta: {
        fields: Object.keys(input).filter((key) => key !== 'credentials'),
        credentialsChanged: input.credentials !== undefined,
      },
    });
    return this.get(id);
  }

  async activate(id: string, actor: Actor): Promise<SmsProviderConfig> {
    await this.requireRow(id);
    await this.activateExclusive(id);
    await this.audit.recordAs(actor, {
      action: 'smsProvider.activate',
      entity: 'SmsProviderConfig',
      entityId: id,
    });
    return this.get(id);
  }

  // Returns the active provider with decrypted credentials for outbound sends.
  async getActiveResolved(): Promise<ResolvedProvider | null> {
    const row = await this.prisma.smsProviderConfig.findFirst({ where: { isActive: true } });
    return row ? this.toResolved(row as ProviderRow) : null;
  }

  // Resolves a saved provider (optionally merged with inline overrides) and
  // merges credentials without ever echoing them back to the caller.
  private async resolveForTest(input: SmsTestInput): Promise<ResolvedProvider> {
    const overrides = input.config ?? {};
    if (!input.providerId) {
      if (!overrides.url || !overrides.sender || !overrides.messageTemplate || !overrides.appName) {
        throw new BadRequestException(
          'Provide a complete inline config (url, sender, messageTemplate, appName) or a providerId',
        );
      }
      return this.toResolved({
        id: 'inline',
        name: overrides.name ?? 'inline',
        provider: overrides.provider ?? 'PING4SMS',
        isActive: false,
        url: overrides.url,
        method: overrides.method ?? 'GET',
        sender: overrides.sender,
        route: overrides.route ?? null,
        templateId: overrides.templateId ?? null,
        header: overrides.header ?? null,
        credentials: this.encrypt(overrides.credentials ?? {}),
        messageTemplate: overrides.messageTemplate,
        appName: overrides.appName,
        variables: overrides.variables ?? null,
        timeoutMs: overrides.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedById: null,
      } as ProviderRow);
    }

    const row = await this.requireRow(input.providerId);
    const merged: ProviderRow = {
      ...row,
      ...overrides,
      credentials:
        overrides.credentials !== undefined
          ? this.encrypt(overrides.credentials)
          : row.credentials,
      variables: overrides.variables ?? (row.variables as Record<string, string> | null),
      route: overrides.route ?? row.route,
      templateId: overrides.templateId ?? row.templateId,
      header: overrides.header ?? row.header,
    };
    return this.toResolved(merged);
  }

  private async dispatch(request: Ping4SmsRequest, timeoutMs: number): Promise<SmsSendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const init: RequestInit = { method: request.method, signal: controller.signal };
      let url = request.url;
      if (request.method.toUpperCase() === 'GET') {
        const params = new URLSearchParams(request.query);
        url = `${request.url}${request.url.includes('?') ? '&' : '?'}${params.toString()}`;
      } else {
        init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        init.body = new URLSearchParams(request.query).toString();
      }
      const response = await fetch(url, init);
      if (!response.ok) {
        this.logger.warn(`SMS provider responded ${response.status}`);
        return { ok: false, status: response.status };
      }
      return { ok: true, status: response.status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SMS provider request failed: ${message}`);
      return { ok: false, error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  // Sends one rendered message through a resolved provider. Never throws.
  async sendResolved(resolved: ResolvedProvider, phone: string, code: string): Promise<SmsSendResult> {
    if (!resolved.credentials.key) {
      this.logger.warn('Active SMS provider has no credentials.key configured');
      return { ok: false, skipped: true };
    }
    const message = renderSmsMessage(resolved.messageTemplate, {
      code,
      appName: resolved.appName,
      variables: resolved.variables,
    });
    const request = buildPing4SmsRequest({ ...resolved.request, message, phone });
    return this.dispatch(request, resolved.timeoutMs);
  }

  async test(input: SmsTestInput, actor: Actor): Promise<SmsTestReport> {
    const resolved = await this.resolveForTest(input);
    const code = input.code && input.code.length > 0 ? input.code : this.crypto.otpCode(6);
    const preview = renderSmsMessage(resolved.messageTemplate, {
      code,
      appName: resolved.appName,
      variables: resolved.variables,
    });

    const results: SmsTestResult[] = [];
    for (const number of input.numbers) {
      if (!resolved.credentials.key) {
        results.push({ to: number, ok: false, skipped: true, error: 'Missing credentials.key', preview });
        continue;
      }
      const request = buildPing4SmsRequest({ ...resolved.request, message: preview, phone: number });
      const result = await this.dispatch(request, resolved.timeoutMs);
      results.push({ to: number, preview, ...result });
    }

    const successCount = results.filter((row) => row.ok).length;
    await this.audit.recordAs(actor, {
      action: 'smsProvider.test',
      entity: 'SmsProviderConfig',
      entityId: resolved.id === 'inline' ? null : resolved.id,
      meta: { numbers: input.numbers, successCount, failureCount: results.length - successCount },
    });
    return {
      providerId: resolved.id === 'inline' ? null : resolved.id,
      provider: resolved.provider,
      code,
      total: results.length,
      successCount,
      failureCount: results.length - successCount,
      results,
    };
  }
}
