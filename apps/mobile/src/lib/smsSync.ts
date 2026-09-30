import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError } from '@gstflow/api-client';
import type { SmsIngestItem, SmsIngestResponse } from '@gstflow/types';
import { api } from './api';
import * as queue from './smsQueue';

/**
 * Queue drainer / sync service.
 *
 * Hard gates: nothing is ever sent unless BOTH a valid session exists AND the
 * user has accepted in-app consent (AsyncStorage 'gstflow.mobile.consent').
 * The same consent flag is read by the Android receiver before it even captures
 * a message, so collection is blocked at the source and transport is blocked
 * here.
 */

export const CONSENT_STORAGE_KEY = 'gstflow.mobile.consent';

const SESSION_STORAGE_KEYS = [
  'gstflow.mobile.auth',
  'gstflow.mobile.session',
  'gstflow.mobile.access',
  'gstflow.mobile.tokens',
];

const DEVICE_ID_STORAGE_KEY = 'gstflow.mobile.deviceId';

const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const MIN_AUTO_SYNC_INTERVAL_MS = 15_000;

export type SyncSkipReason = 'no-session' | 'no-consent' | 'empty' | 'in-progress';

export interface SyncResult {
  ok: boolean;
  sent: number;
  skipped?: SyncSkipReason;
  error?: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseConsent(raw: string | null): boolean {
  if (!raw) return false;
  const normalized = raw.trim().replace(/^"|"$/g, '').toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'accepted') {
    return true;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'boolean') return parsed;
    if (parsed && typeof parsed === 'object' && 'accepted' in parsed) {
      return Boolean((parsed as { accepted?: unknown }).accepted);
    }
  } catch {
    // not JSON
  }
  return false;
}

export async function hasConsent(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(CONSENT_STORAGE_KEY);
  return parseConsent(raw);
}

let sessionChecker: (() => Promise<boolean>) | null = null;

/**
 * Lets the auth layer provide the authoritative session check. When unset, a
 * defensive AsyncStorage lookup is used.
 */
export function setSessionChecker(checker: (() => Promise<boolean>) | null): void {
  sessionChecker = checker;
}

async function defaultSessionChecker(): Promise<boolean> {
  for (const key of SESSION_STORAGE_KEYS) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === 'string') {
        if (parsed.trim()) return true;
        continue;
      }
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>;
        if (record.accessToken || record.tokens) return true;
        continue;
      }
      if (parsed) return true;
    } catch {
      if (raw.trim() && raw.trim().toLowerCase() !== 'null') return true;
    }
  }
  return false;
}

export async function hasValidSession(): Promise<boolean> {
  if (sessionChecker) return sessionChecker();
  return defaultSessionChecker();
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) {
    return (
      error.statusCode >= 500 ||
      error.statusCode === 408 ||
      error.statusCode === 429
    );
  }
  // Network / fetch failures are retryable.
  return true;
}

async function ingestBatch(items: SmsIngestItem[]): Promise<SmsIngestResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await api.sms.ingest({ items });
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS - 1) break;
      const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      await delay(backoff);
    }
  }
  throw lastError;
}

let syncing = false;

export async function syncNow(): Promise<SyncResult> {
  if (syncing) {
    return { ok: false, sent: 0, skipped: 'in-progress' };
  }

  const consented = await hasConsent();
  if (!consented) {
    return { ok: false, sent: 0, skipped: 'no-consent' };
  }

  const session = await hasValidSession();
  if (!session) {
    return { ok: false, sent: 0, skipped: 'no-session' };
  }

  const pending = await queue.list();
  if (pending.length === 0) {
    return { ok: true, sent: 0, skipped: 'empty' };
  }

  const deviceId = (await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY)) ?? undefined;
  syncing = true;
  let sent = 0;
  try {
    for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
      const batch = pending.slice(offset, offset + BATCH_SIZE);
      const items: SmsIngestItem[] = batch.map((entry) => {
        const resolvedDeviceId = entry.deviceId ?? deviceId;
        return {
          sender: entry.sender,
          body: entry.body,
          receivedAt: entry.receivedAt,
          hash: entry.hash,
          ...(resolvedDeviceId ? { deviceId: resolvedDeviceId } : {}),
        };
      });

      const response = await ingestBatch(items);
      // A 2xx means the server accounted for the batch (accepted + duplicates);
      // rejected rows are malformed and must not be retried forever.
      await queue.remove(batch.map((entry) => entry.id));
      sent += response.accepted;
    }
    return { ok: true, sent };
  } catch (error) {
    return { ok: false, sent, error: error instanceof Error ? error.message : String(error) };
  } finally {
    syncing = false;
  }
}

/**
 * Starts a periodic drain. Each tick re-checks the consent + session gates, so
 * revoking consent stops transport immediately.
 *
 * @returns a function that stops the timer.
 */
export function startAutoSync(intervalMs = 60_000): () => void {
  const interval = Math.max(intervalMs, MIN_AUTO_SYNC_INTERVAL_MS);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      await syncNow();
    } finally {
      if (!stopped) timer = setTimeout(tick, interval);
    }
  };

  void tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
