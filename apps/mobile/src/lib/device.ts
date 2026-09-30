import { Platform } from 'react-native';
import CryptoJS from 'crypto-js';
import type { DeviceRegisterBody } from '@gstflow/types';
import { APP_VERSION } from '@/config';
import { getStoredDeviceId, setStoredDeviceId } from './storage';

export async function getOrCreateAndroidId(): Promise<string> {
  const existing = await getStoredDeviceId();
  if (existing) return existing;
  const generated = CryptoJS.lib.WordArray.random(16).toString();
  await setStoredDeviceId(generated);
  return generated;
}

function platformName(): DeviceRegisterBody['platform'] {
  return Platform.OS === 'ios' ? 'IOS' : 'ANDROID';
}

function platformConstants(): Record<string, unknown> {
  return (Platform.constants ?? {}) as unknown as Record<string, unknown>;
}

export async function getDeviceInfo(): Promise<DeviceRegisterBody> {
  const androidId = await getOrCreateAndroidId();
  const constants = platformConstants();
  const model = typeof constants.Model === 'string' ? constants.Model : undefined;
  const osVersion = typeof constants.Release === 'string' ? constants.Release : undefined;
  return {
    androidId,
    platform: platformName(),
    model,
    osVersion,
    appVersion: APP_VERSION,
  };
}
