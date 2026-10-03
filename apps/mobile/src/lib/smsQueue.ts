import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SmsIngestItem } from '@gstflow/types';
import * as CryptoJS from 'crypto-js';

/**
 * Encrypted offline queue.
 *
 * Queued SMS are AES-encrypted with a per-install random key before being
 * persisted to AsyncStorage. The key never leaves the device; transport to the
 * backend is HTTPS/TLS and the backend additionally encrypts the body at rest.
 * Entries are de-duplicated by hash and capped, dropping the oldest first.
 */

export const QUEUE_STORAGE_KEY = 'gstflow.mobile.queue';
export const QUEUE_KEY_STORAGE_KEY = 'gstflow.mobile.queue.key';
export const MAX_QUEUE_SIZE = 500;

interface QueueEntry {
  id: string;
  hash: string;
  ciphertext: string;
  createdAt: string;
}

export type QueuedSms = SmsIngestItem & { id: string };

let keyPromise: Promise<string> | null = null;

async function getQueueKey(): Promise<string> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const existing = await AsyncStorage.getItem(QUEUE_KEY_STORAGE_KEY);
      if (existing) return existing;
      const generated = CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
      await AsyncStorage.setItem(QUEUE_KEY_STORAGE_KEY, generated);
      return generated;
    })();
  }
  return keyPromise;
}

function encrypt(item: SmsIngestItem, key: string): string {
  return CryptoJS.AES.encrypt(JSON.stringify(item), key).toString();
}

function decrypt(ciphertext: string, key: string): SmsIngestItem {
  const plain = CryptoJS.AES.decrypt(ciphertext, key).toString(CryptoJS.enc.Utf8);
  if (!plain) throw new Error('Failed to decrypt queued SMS');
  return JSON.parse(plain) as SmsIngestItem;
}

async function readEntries(): Promise<QueueEntry[]> {
  const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as QueueEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeEntries(entries: QueueEntry[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(entries));
}

// Serialise read-modify-write cycles so concurrent callers cannot clobber the queue.
let chain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn);
  chain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Change notification.
 *
 * The queue is mutated by several independent actors (the live SMS listener,
 * the inbox backfill, the manual Sync button, and the app-lifetime auto-sync
 * loop). Screens must re-read the queue whenever any of them removes or adds an
 * entry; otherwise a background auto-sync leaves the UI showing stale "Queued"
 * rows until the next manual refresh.
 */
export type QueueListener = (items: QueuedSms[]) => void;

const listeners = new Set<QueueListener>();

function publish(): void {
  if (listeners.size === 0) return;
  void list()
    .then((items) => {
      for (const listener of listeners) {
        try {
          listener(items);
        } catch {
          // A misbehaving subscriber must not break queue mutations.
        }
      }
    })
    .catch(() => undefined);
}

/** Subscribe to queue changes. Returns an unsubscribe function. */
export function subscribe(listener: QueueListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function enqueue(
  item: SmsIngestItem,
): Promise<{ added: boolean; id: string; size: number }> {
  const result = await withLock(async () => {
    const key = await getQueueKey();
    const entries = await readEntries();
    const existing = entries.find((entry) => entry.hash === item.hash);
    if (existing) {
      return { added: false, id: existing.id, size: entries.length };
    }
    const entry: QueueEntry = {
      id: item.hash,
      hash: item.hash,
      ciphertext: encrypt(item, key),
      createdAt: new Date().toISOString(),
    };
    entries.push(entry);
    while (entries.length > MAX_QUEUE_SIZE) {
      entries.shift();
    }
    await writeEntries(entries);
    return { added: true, id: entry.id, size: entries.length };
  });
  if (result.added) publish();
  return result;
}

export async function list(): Promise<QueuedSms[]> {
  const key = await getQueueKey();
  const entries = await readEntries();
  const out: QueuedSms[] = [];
  for (const entry of entries) {
    try {
      const item = decrypt(entry.ciphertext, key);
      out.push({ ...item, id: entry.id });
    } catch {
      // Corrupt/undecryptable entry: skip rather than block the whole queue.
    }
  }
  return out;
}

export async function remove(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const removed = await withLock(async () => {
    const wanted = new Set(ids);
    const entries = await readEntries();
    const kept = entries.filter((entry) => !wanted.has(entry.id));
    const count = entries.length - kept.length;
    if (count > 0) await writeEntries(kept);
    return count;
  });
  if (removed > 0) publish();
  return removed;
}

export async function size(): Promise<number> {
  const entries = await readEntries();
  return entries.length;
}

export async function clear(): Promise<void> {
  await withLock(async () => {
    await writeEntries([]);
  });
  publish();
}
