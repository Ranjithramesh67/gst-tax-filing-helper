import { AppState } from 'react-native';
import { SmsReader } from '@/native/SmsReader';

/**
 * Battery-saver helpers.
 *
 * Android defers background work for apps that are not battery-optimization
 * exempt, which can delay or drop the forwarding of a captured GST SMS / OTP.
 * These wrap the native checks and the system exemption dialog, plus the
 * OEM-specific autostart screens that aggressive ROMs need on top.
 */

export interface BatteryStatus {
  /** True when the OS will not defer this app's background work. */
  ignoring: boolean;
  manufacturer: string;
  /** True for manufacturers known to kill background apps aggressively. */
  aggressiveOem: boolean;
}

const AGGRESSIVE_OEMS = [
  'xiaomi',
  'redmi',
  'poco',
  'oppo',
  'realme',
  'vivo',
  'iqoo',
  'huawei',
  'honor',
  'oneplus',
  'asus',
  'meizu',
  'samsung',
  'tecno',
  'infinix',
  'itel',
];

export function isAggressiveManufacturer(manufacturer: string): boolean {
  const name = manufacturer.toLowerCase();
  return AGGRESSIVE_OEMS.some((oem) => name.includes(oem));
}

export async function getBatteryStatus(): Promise<BatteryStatus> {
  const [ignoring, manufacturer] = await Promise.all([
    SmsReader.isIgnoringBatteryOptimizations().catch(() => true),
    SmsReader.getDeviceManufacturer().catch(() => ''),
  ]);
  return { ignoring, manufacturer, aggressiveOem: isAggressiveManufacturer(manufacturer) };
}

/** Opens the system exemption dialog. Re-check the status on app resume. */
export function requestBatteryExemption(): Promise<boolean> {
  return SmsReader.requestIgnoreBatteryOptimizations().catch(() => false);
}

/** Opens the OEM autostart/protected-apps screen where available. */
export function openAutoStartSettings(): Promise<boolean> {
  return SmsReader.openAutoStartSettings().catch(() => false);
}

/** Runs `handler` whenever the app returns to the foreground. */
export function onAppForeground(handler: () => void): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') handler();
  });
  return () => sub.remove();
}
