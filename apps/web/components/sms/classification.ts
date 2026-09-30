import { SmsCategory, SmsStatus } from '@gstflow/types';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export const SMS_CATEGORIES: SmsCategory[] = [
  SmsCategory.GST_INVOICE,
  SmsCategory.GST_RETURN,
  SmsCategory.EWAY_BILL,
  SmsCategory.TAX_PAYMENT,
  SmsCategory.GST_NOTICE,
  SmsCategory.UNCLASSIFIED,
  SmsCategory.OTHER,
];

export const SMS_STATUSES: SmsStatus[] = [
  SmsStatus.RECEIVED,
  SmsStatus.REVIEWED,
  SmsStatus.FILED,
  SmsStatus.IGNORED,
  SmsStatus.FAILED,
];

export const CATEGORY_TONES: Record<SmsCategory, BadgeTone> = {
  [SmsCategory.GST_INVOICE]: 'info',
  [SmsCategory.GST_RETURN]: 'success',
  [SmsCategory.EWAY_BILL]: 'neutral',
  [SmsCategory.TAX_PAYMENT]: 'warning',
  [SmsCategory.GST_NOTICE]: 'danger',
  [SmsCategory.UNCLASSIFIED]: 'neutral',
  [SmsCategory.OTHER]: 'neutral',
};

export const STATUS_TONES: Record<SmsStatus, BadgeTone> = {
  [SmsStatus.RECEIVED]: 'warning',
  [SmsStatus.REVIEWED]: 'info',
  [SmsStatus.FILED]: 'success',
  [SmsStatus.IGNORED]: 'neutral',
  [SmsStatus.FAILED]: 'danger',
};

export function categoryLabel(value: SmsCategory | SmsStatus): string {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatMoney(value?: number | null): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

export function snippet(body: string, length = 80): string {
  const trimmed = body.trim();
  return trimmed.length > length ? `${trimmed.slice(0, length)}...` : trimmed;
}
