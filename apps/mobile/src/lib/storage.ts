import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Client } from '@gstflow/types';

export const AUTH_STORAGE_KEY = 'gstflow.mobile.auth';
export const CONSENT_STORAGE_KEY = 'gstflow.mobile.consent';
export const SMS_QUEUE_STORAGE_KEY = 'gstflow.mobile.smsQueue';
export const DEVICE_ID_STORAGE_KEY = 'gstflow.mobile.deviceId';
export const READING_ENABLED_KEY = 'gstflow.mobile.readingEnabled';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  client: Client | null;
}

export interface StoredConsent {
  version: string;
  acceptedAt: string;
  accepted: boolean;
  otpVerified: boolean;
}

export interface QueuedSms {
  sender: string;
  body: string;
  receivedAt: string;
  hash: string;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function getStoredSession(): Promise<StoredSession | null> {
  return parseJson<StoredSession>(await AsyncStorage.getItem(AUTH_STORAGE_KEY));
}

export async function setStoredSession(session: StoredSession): Promise<void> {
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export async function updateStoredTokens(tokens: {
  accessToken: string;
  refreshToken: string;
}): Promise<void> {
  const current = await getStoredSession();
  if (!current) return;
  await setStoredSession({ ...current, ...tokens });
}

export async function clearStoredSession(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
}

export async function getStoredConsent(): Promise<StoredConsent | null> {
  return parseJson<StoredConsent>(await AsyncStorage.getItem(CONSENT_STORAGE_KEY));
}

export async function setStoredConsent(consent: StoredConsent): Promise<void> {
  await AsyncStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
}

export async function clearStoredConsent(): Promise<void> {
  await AsyncStorage.removeItem(CONSENT_STORAGE_KEY);
}

export async function getQueuedSms(): Promise<QueuedSms[]> {
  return parseJson<QueuedSms[]>(await AsyncStorage.getItem(SMS_QUEUE_STORAGE_KEY)) ?? [];
}

export async function setQueuedSms(items: QueuedSms[]): Promise<void> {
  await AsyncStorage.setItem(SMS_QUEUE_STORAGE_KEY, JSON.stringify(items));
}

export async function enqueueSms(item: QueuedSms): Promise<void> {
  const queue = await getQueuedSms();
  queue.push(item);
  await setQueuedSms(queue);
}

export async function clearQueuedSms(): Promise<void> {
  await AsyncStorage.removeItem(SMS_QUEUE_STORAGE_KEY);
}

export async function getStoredDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
}

export async function setStoredDeviceId(id: string): Promise<void> {
  await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
}

/**
 * Whether the user has background reading turned on. Defaults to true once
 * consent exists, so existing installs keep reading until explicitly paused.
 * The native receiver is gated by this mirrored flag, not by a running service.
 */
export async function getReadingEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(READING_ENABLED_KEY);
  if (raw == null) return true;
  return raw === 'true';
}

export async function setReadingEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(READING_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function clearReadingEnabled(): Promise<void> {
  await AsyncStorage.removeItem(READING_ENABLED_KEY);
}
