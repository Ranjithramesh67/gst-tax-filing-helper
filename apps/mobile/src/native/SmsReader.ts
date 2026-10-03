import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { hashMessage } from '../lib/gstFilter';

/**
 * Typed JS wrapper over the Android `SmsReader` native module, with a web/no-op
 * fallback so callers never have to guard on platform. The native module emits
 * `onSmsReceived`; subscribe with `SmsReader.onSmsReceived(cb)`.
 */

export interface ReceivedSms {
  sender: string;
  body: string;
  receivedAt: string;
  hash: string;
}

interface NativeSmsPayload {
  sender: string;
  body: string;
  receivedAt: number;
  receivedAtIso?: string;
  hash?: string;
}

interface SmsReaderNativeModule {
  requestSmsPermission(): Promise<boolean>;
  hasSmsPermission(): Promise<boolean>;
  startListening(): Promise<boolean>;
  stopListening(): Promise<boolean>;
  setConsent(enabled: boolean): Promise<boolean>;
  getRecentGstSms(limit: number): Promise<NativeSmsPayload[]>;
  flushPending(): Promise<number>;
  clearNotification(): Promise<boolean>;
  setSyncCredentials(accessToken: string | null, deviceId: string | null): Promise<boolean>;
  addListener?(eventName: string): void;
  removeListeners?(count: number): void;
}

const EVENT_NAME = 'onSmsReceived';

const nativeModule: SmsReaderNativeModule | null =
  Platform.OS === 'android' && NativeModules.SmsReader
    ? (NativeModules.SmsReader as SmsReaderNativeModule)
    : null;

const emitter = nativeModule ? new NativeEventEmitter(NativeModules.SmsReader) : null;

function toReceivedSms(payload: NativeSmsPayload): ReceivedSms {
  const receivedAt = payload.receivedAtIso ?? new Date(payload.receivedAt).toISOString();
  return {
    sender: payload.sender ?? '',
    body: payload.body ?? '',
    receivedAt,
    hash: hashMessage(payload.sender ?? '', payload.body ?? '', receivedAt),
  };
}

export const SmsReader = {
  isAvailable: nativeModule != null,

  requestSmsPermission(): Promise<boolean> {
    return nativeModule ? nativeModule.requestSmsPermission() : Promise.resolve(false);
  },

  hasSmsPermission(): Promise<boolean> {
    return nativeModule ? nativeModule.hasSmsPermission() : Promise.resolve(false);
  },

  startListening(): Promise<boolean> {
    return nativeModule ? nativeModule.startListening() : Promise.resolve(false);
  },

  stopListening(): Promise<boolean> {
    return nativeModule ? nativeModule.stopListening() : Promise.resolve(false);
  },

  setConsent(enabled: boolean): Promise<boolean> {
    return nativeModule ? nativeModule.setConsent(enabled) : Promise.resolve(false);
  },

  async getRecentGstSms(limit = 50): Promise<ReceivedSms[]> {
    if (!nativeModule) return [];
    const payloads = await nativeModule.getRecentGstSms(limit);
    return payloads.map(toReceivedSms);
  },

  flushPending(): Promise<number> {
    return nativeModule ? nativeModule.flushPending() : Promise.resolve(0);
  },

  /** Removes the transient SMS-ingest notification, if still showing. */
  clearNotification(): Promise<boolean> {
    return nativeModule ? nativeModule.clearNotification() : Promise.resolve(false);
  },

  /**
   * Mirrors the signed-in access token (and device id) to native storage so the
   * Android uploader can forward captured SMS while JS is not running. Pass null
   * to clear on sign-out.
   */
  setSyncCredentials(accessToken: string | null, deviceId: string | null = null): Promise<boolean> {
    return nativeModule ? nativeModule.setSyncCredentials(accessToken, deviceId) : Promise.resolve(false);
  },

  /** Subscribe to incoming GST SMS. Returns an unsubscribe function. */
  onSmsReceived(callback: (sms: ReceivedSms) => void): () => void {
    if (!emitter) return () => undefined;
    const subscription = emitter.addListener(EVENT_NAME, (payload: NativeSmsPayload) => {
      callback(toReceivedSms(payload));
    });
    return () => subscription.remove();
  },
};
