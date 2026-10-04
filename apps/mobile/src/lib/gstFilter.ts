import type { SmsCategory } from '@gstflow/types';
import * as CryptoJS from 'crypto-js';

/**
 * Pure GST filter. This is the JS mirror of apps/api/src/sms/sms-parser.ts and
 * of the Kotlin GstFilter used by the Android receiver. The capture rule and
 * the classification pattern order must stay identical across all three.
 *
 * Capture rule: a message is GST-related when the sender (header) or the body
 * contains the substring "gst" (case-insensitive). This covers GST, GSTIN,
 * GSTR and GSTN, and deliberately excludes the broader tax/invoice keywords.
 */

const RETURN_PATTERNS = [
  /\bgstr[\s-]*(?:1|3b|9)\b/i,
  /\bgstr\b/i,
  /\breturn\s+(?:filed|due|filing)\b/i,
  /\bfiling\b/i,
];

const EWAY_PATTERNS = [/\be-?way\b/i, /\bewb\b/i, /\bway\s*bill\b/i];

const PAYMENT_PATTERNS = [/\bchallan\b/i, /\bpmt\b/i, /\bpaid\b/i, /\bpayment\b/i];

const NOTICE_PATTERNS = [
  /\bnotice\b/i,
  /\bdemand\b/i,
  /\basmt\b/i,
  /\bshow\s*cause\b/i,
  /\bdrc\b/i,
];

const INVOICE_PATTERNS = [/\binvoice\b/i, /\bbill\b/i, /\bhsgst\b/i];

function matches(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function isGstRelated(body: string | null | undefined, sender?: string | null): boolean {
  return (body ?? '').toLowerCase().includes('gst') || (sender ?? '').toLowerCase().includes('gst');
}

export function classifySms(body: string | null | undefined, sender?: string): SmsCategory {
  const text = `${body ?? ''} ${sender ?? ''}`;
  if (matches(RETURN_PATTERNS, text)) return 'GST_RETURN';
  if (matches(EWAY_PATTERNS, text)) return 'EWAY_BILL';
  if (matches(PAYMENT_PATTERNS, text)) return 'TAX_PAYMENT';
  if (matches(NOTICE_PATTERNS, text)) return 'GST_NOTICE';
  if (matches(INVOICE_PATTERNS, text)) return 'GST_INVOICE';
  if (isGstRelated(text)) return 'UNCLASSIFIED';
  return 'OTHER';
}

/**
 * Normalises an ISO timestamp to whole-second UTC precision. The SMS broadcast
 * timestamp and the inbox `date` column can differ in sub-second precision for
 * the same physical message; flooring makes their hashes identical so it is not
 * captured twice.
 */
export function normaliseReceivedAt(receivedAtIso: string): string {
  const date = new Date(receivedAtIso);
  if (Number.isNaN(date.getTime())) return receivedAtIso;
  return new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString();
}

/**
 * Stable de-duplication hash. Must be byte-for-byte identical to the Kotlin
 * GstFilter.hashMessage so a message captured natively and re-hashed in JS maps
 * to the same queue entry / server row. Timestamps are floored to whole seconds
 * so the two capture paths agree.
 */
export function hashMessage(
  sender: string,
  body: string,
  receivedAtIso: string,
): string {
  const normalized = normaliseReceivedAt(receivedAtIso);
  return CryptoJS.SHA256(`${sender}|${body}|${normalized}`).toString(CryptoJS.enc.Hex);
}
