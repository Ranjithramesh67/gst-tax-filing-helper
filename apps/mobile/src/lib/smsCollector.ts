import { AppState, type AppStateStatus } from 'react-native';
import { SmsReader, type ReceivedSms } from '@/native/SmsReader';
import * as queue from './smsQueue';
import { getReadingEnabled } from './storage';
import { hasConsent, startAutoSync, syncNow } from './smsSync';

/**
 * App-wide SMS collector.
 *
 * The native layer only forwards a message to JS while a listener is attached,
 * and only buffers when no React instance is running. A listener that lives on
 * a single screen therefore drops messages received elsewhere. This module owns
 * a single, app-lifetime subscription plus an inbox backfill so nothing is lost
 * when the app or the SMS Log screen was not open at delivery time.
 */

const BACKFILL_LIMIT = 200;

async function ingest(sms: ReceivedSms): Promise<boolean> {
  const result = await queue.enqueue({
    sender: sms.sender,
    body: sms.body,
    receivedAt: sms.receivedAt,
    hash: sms.hash,
  });
  return result.added;
}

/**
 * Pull recent GST-matching messages straight from the device inbox and queue any
 * that are not already present. Recovers messages received while JS was not
 * listening (app closed, other screen focused, process restarted).
 */
export async function backfillRecentGstSms(limit = BACKFILL_LIMIT): Promise<number> {
  const recent = await SmsReader.getRecentGstSms(limit);
  let added = 0;
  for (const sms of recent) {
    if (await ingest(sms)) added += 1;
  }
  return added;
}

/** Fire-and-forget drain; syncNow de-duplicates concurrent calls. */
function requestSync(): void {
  void syncNow();
}

/**
 * Starts the app-wide collector. Mirrors consent (gated by the persisted reading
 * flag) to the native layer, drains buffered SMS, backfills the inbox, and runs
 * app-lifetime auto-sync so captured messages are sent without a manual tap.
 * Returns a cleanup function.
 */
export function startSmsCollector(): () => void {
  let active = true;

  const unsubscribe = SmsReader.onSmsReceived((sms) => {
    void (async () => {
      if (await ingest(sms)) requestSync();
    })();
  });

  const stopAutoSync = startAutoSync();

  const onAppStateChange = (state: AppStateStatus): void => {
    if (state !== 'active') return;
    // JS timers pause while backgrounded, so drain on return to foreground.
    void (async () => {
      if (!active) return;
      try {
        await backfillRecentGstSms();
      } catch {
        // READ_SMS may not be granted yet.
      }
      requestSync();
    })();
  };
  const appStateSub = AppState.addEventListener('change', onAppStateChange);

  void (async () => {
    try {
      const [consented, readingEnabled] = await Promise.all([
        hasConsent(),
        getReadingEnabled(),
      ]);
      await SmsReader.setConsent(consented && readingEnabled);
      if (consented && readingEnabled) {
        await SmsReader.startListening();
      }
    } catch {
      // Native module unavailable (e.g. web) or service start blocked.
    }
    try {
      // Drains anything the receiver captured while JS was detached.
      await SmsReader.flushPending();
    } catch {
      void 0;
    }
    if (active) {
      try {
        await backfillRecentGstSms();
      } catch {
        // READ_SMS may not be granted yet; the collector still handles live SMS.
      }
      requestSync();
    }
  })();

  return () => {
    active = false;
    appStateSub.remove();
    unsubscribe();
    stopAutoSync();
  };
}
