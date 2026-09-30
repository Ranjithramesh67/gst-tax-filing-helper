import { Platform } from 'react-native';
import { check, request, RESULTS, PERMISSIONS } from 'react-native-permissions';

/**
 * Thin wrapper over react-native-permissions for the SMS and notification
 * permissions. On non-Android platforms SMS reading is unavailable, so the
 * helpers resolve to false instead of throwing.
 */

function isGranted(status: string): boolean {
  return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
}

const ANDROID_SMS_PERMISSIONS = [
  PERMISSIONS.ANDROID.RECEIVE_SMS,
  PERMISSIONS.ANDROID.READ_SMS,
];

export function isSmsSupported(): boolean {
  return Platform.OS === 'android';
}

export async function hasSmsPermission(): Promise<boolean> {
  if (!isSmsSupported()) return false;
  const statuses = await Promise.all(ANDROID_SMS_PERMISSIONS.map((perm) => check(perm)));
  return statuses.every(isGranted);
}

export async function requestSmsPermission(): Promise<boolean> {
  if (!isSmsSupported()) return false;
  const statuses = [];
  for (const perm of ANDROID_SMS_PERMISSIONS) {
    const current = await check(perm);
    statuses.push(isGranted(current) ? current : await request(perm));
  }
  return statuses.every(isGranted);
}

export async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const status = await check(PERMISSIONS.ANDROID.POST_NOTIFICATIONS);
  return isGranted(status);
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const current = await check(PERMISSIONS.ANDROID.POST_NOTIFICATIONS);
  if (isGranted(current)) return true;
  const status = await request(PERMISSIONS.ANDROID.POST_NOTIFICATIONS);
  return isGranted(status);
}
