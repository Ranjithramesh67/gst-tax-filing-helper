import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Role } from '@gstflow/types';
import type {
  InboxItem,
  OtpIngestItem,
  OtpIngestResponse,
  OtpSource,
  PaginatedInbox,
  SmsMessage,
} from '@gstflow/types';

import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { paginate, parsePagination } from '../common/pagination';
import { serialiseSms } from '../common/serializers';
import type { Actor } from '../common/auth/actor.types';
import type { InboxListQueryDto } from './dto';
import { resolveActiveLinkTargets } from './link-targets';

const SETTINGS_KEY = 'otp.settings';
const DEFAULT_GROUP_WINDOW_SECONDS = 300;

/**
 * Maximum number of rows pulled from each source (OTP events and raw SMS)
 * before the feed is built in memory. The feed is sorted and paginated over
 * this window, so a page can only ever reflect the newest {@link FEED_OVERFETCH}
 * events/messages per source. Documented cap, aligned with the plan.
 */
const FEED_OVERFETCH = 500;

/** Upper bound for the masked snippet/context returned for any inbox row. */
const SNIPPET_MAX_CHARS = 160;

const inboxSmsInclude = Prisma.validator<Prisma.SmsMessageInclude>()({
  client: { select: { id: true, name: true, gstin: true } },
  parsed: true,
});

type InboxSmsRow = Prisma.SmsMessageGetPayload<{ include: typeof inboxSmsInclude }>;

interface OtpGroupAccumulator {
  id: string;
  clientId: string;
  code: string;
  sources: Map<OtpSource, Date>;
  from: string | null;
  subject: string | null;
  snippet: string | null;
  firstAt: Date;
  latestAt: Date;
  eventCount: number;
}

function toNumber(value: string | number | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildTimeFilter(
  from: string | undefined,
  to: string | undefined,
): Prisma.DateTimeFilter | undefined {
  const filter: Prisma.DateTimeFilter = {};
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !Number.isNaN(fromDate.getTime())) filter.gte = fromDate;
  if (toDate && !Number.isNaN(toDate.getTime())) filter.lte = toDate;
  return filter.gte || filter.lte ? filter : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collapses whitespace and truncates arbitrary text to a short context string. */
function shorten(value: string): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length > SNIPPET_MAX_CHARS
    ? `${collapsed.slice(0, SNIPPET_MAX_CHARS).trimEnd()}…`
    : collapsed;
}

/** Masks every occurrence of an OTP code inside a snippet so only context leaks. */
function maskCode(snippet: string, code: string): string {
  if (!code) return shorten(snippet);
  return shorten(snippet.replace(new RegExp(escapeRegExp(code), 'gi'), '••••'));
}

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

  /**
   * Unified inbox feed for the authenticated client.
   *
   * OTP events for the actor's firm+client are collapsed by their persisted
   * `groupId`; SMS rows whose id is referenced by an SMS-sourced `OtpEvent` are
   * removed because the group already represents them. OTP groups and remaining
   * raw SMS are merged, sorted newest-first, and paginated in memory over an
   * over-fetched window capped at {@link FEED_OVERFETCH} rows per source.
   *
   * Privacy: an OTP group exposes only its code plus a short, code-masked
   * snippet/context; raw SMS bodies are truncated to a short snippet so a full
   * message body is never returned here.
   */
  async listFeed(actor: Actor, query: InboxListQueryDto): Promise<PaginatedInbox> {
    const clientId = actor.clientId;
    if (actor.role !== Role.CLIENT || !clientId) {
      throw new ForbiddenException('No client is associated with this account');
    }

    const slice = parsePagination({
      page: toNumber(query.page),
      pageSize: toNumber(query.pageSize),
    });

    // A client actor owns exactly one client row. A query-supplied clientId can
    // never widen or cross tenant scope: anything but the actor's own id yields
    // no rows.
    if (query.clientId && query.clientId !== clientId) {
      return paginate<InboxItem>([], 0, slice);
    }

    const firmId = actor.firmId ?? '__no_firm__';
    const otpWhere: Prisma.OtpEventWhereInput = { firmId, clientId };
    const smsWhere: Prisma.SmsMessageWhereInput = { clientId };
    if (query.category) smsWhere.category = query.category as SmsMessage['category'];
    if (query.search) {
      otpWhere.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { fromAddress: { contains: query.search, mode: 'insensitive' } },
        { subject: { contains: query.search, mode: 'insensitive' } },
      ];
      smsWhere.sender = { contains: query.search, mode: 'insensitive' };
    }
    const timeFilter = buildTimeFilter(query.from, query.to);
    if (timeFilter) {
      otpWhere.receivedAt = timeFilter;
      smsWhere.receivedAt = timeFilter;
    }

    const [otpRows, smsRows] = await Promise.all([
      this.prisma.otpEvent.findMany({
        where: otpWhere,
        orderBy: { receivedAt: 'desc' },
        take: FEED_OVERFETCH,
      }),
      this.prisma.smsMessage.findMany({
        where: smsWhere,
        include: inboxSmsInclude,
        orderBy: { receivedAt: 'desc' },
        take: FEED_OVERFETCH,
      }),
    ]);

    // Dedupe: an SMS captured as an OTP is represented by its group, not raw.
    const smsIds = smsRows.map((row) => row.id);
    const referenced = smsIds.length
      ? await this.prisma.otpEvent.findMany({
          where: { firmId, clientId, source: 'SMS', sourceRef: { in: smsIds } },
          select: { sourceRef: true },
        })
      : [];
    const capturedSmsIds = new Set(referenced.map((row) => row.sourceRef));
    const rawSms = smsRows.filter((row) => !capturedSmsIds.has(row.id));

    const clientNames = await this.resolveClientNames(otpRows.map((row) => row.clientId));
    const otpItems = this.buildOtpItems(otpRows, clientNames);

    const entries = [
      ...otpItems.map((item) => ({ item: item as InboxItem, at: Date.parse(item.latestAt) })),
      ...rawSms.map((row) => ({ item: this.serialiseInboxSms(row), at: row.receivedAt.getTime() })),
    ].sort((a, b) => b.at - a.at || (a.item.id < b.item.id ? -1 : 1));

    const items = entries.slice(slice.skip, slice.skip + slice.pageSize).map((entry) => entry.item);

    return paginate(items, entries.length, slice);
  }

  private serialiseInboxSms(row: InboxSmsRow): InboxItem {
    let body = '';
    try {
      body = shorten(this.crypto.decrypt(row.bodyEncrypted));
    } catch {
      body = '';
    }
    return { kind: 'SMS', ...serialiseSms({ ...row, body }) };
  }

  private async resolveClientNames(
    clientIds: string[],
  ): Promise<Map<string, { id: string; name: string }>> {
    const unique = [...new Set(clientIds)];
    const map = new Map<string, { id: string; name: string }>();
    if (unique.length === 0) return map;
    const clients = await this.prisma.client.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    for (const client of clients) map.set(client.id, { id: client.id, name: client.name });
    return map;
  }

  private buildOtpItems(
    rows: Array<{
      id: string;
      groupId: string | null;
      clientId: string;
      code: string;
      source: OtpSource;
      fromAddress: string | null;
      subject: string | null;
      snippet: string | null;
      receivedAt: Date;
    }>,
    clientNames: Map<string, { id: string; name: string }>,
  ): Array<Extract<InboxItem, { kind: 'OTP' }>> {
    const groups = new Map<string, OtpGroupAccumulator>();
    for (const row of rows) {
      const key = row.groupId ?? row.id;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          id: key,
          clientId: row.clientId,
          code: row.code,
          sources: new Map([[row.source, row.receivedAt]]),
          from: row.fromAddress,
          subject: row.subject,
          snippet: row.snippet,
          firstAt: row.receivedAt,
          latestAt: row.receivedAt,
          eventCount: 1,
        });
        continue;
      }
      // Rows arrive newest-first, so each later occurrence is older; the last
      // write for a source is therefore its earliest (first-seen) timestamp.
      existing.sources.set(row.source, row.receivedAt);
      existing.eventCount += 1;
      if (row.receivedAt < existing.firstAt) existing.firstAt = row.receivedAt;
      if (row.receivedAt > existing.latestAt) existing.latestAt = row.receivedAt;
    }

    return [...groups.values()].map((group) => {
      const client = clientNames.get(group.clientId) ?? { id: group.clientId, name: '' };
      return {
        kind: 'OTP',
        id: group.id,
        code: group.code,
        sources: [...group.sources.entries()]
          .sort((a, b) => a[1].getTime() - b[1].getTime())
          .map(([source]) => source),
        client: { id: client.id, name: client.name },
        from: group.from,
        subject: group.subject,
        snippet:
          group.snippet == null
            ? null
            : maskCode(this.decryptSnippet(group.snippet) ?? '', group.code),
        receivedAt: group.firstAt.toISOString(),
        latestAt: group.latestAt.toISOString(),
        eventCount: group.eventCount,
      };
    });
  }
}
