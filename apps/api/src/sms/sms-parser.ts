import type { SmsCategory } from '@gstflow/types';

// Capture rule shared with the Kotlin GstFilter and the JS mirror: a message is
// GST-related when the sender (header) or the body contains "gst"
// (case-insensitive), covering GST, GSTIN, GSTR and GSTN.
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

const GSTIN_REGEX = /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/;
const INVOICE_REGEX =
  /(?:invoice|inv|bill)\s*(?:no|number|num|#)?\s*[:#.\-]?\s*([a-z0-9][a-z0-9/\-]*\d[a-z0-9/\-]*)/i;

// Matches Indian/Western grouped digits with optional 1-2 decimal places.
// e.g. 1,00,000 / 12,34,567.50 / 18000 / 999.9
const NUMBER_PATTERN = '[0-9][0-9,]*(?:\\.[0-9]{1,2})?';
// Optional currency marker: Rs / Rs. / INR / the rupee sign.
const CURRENCY_PATTERN = '(?:rs\\.?|inr|₹)?\\s*';

const TOTAL_REGEX = new RegExp(
  `(?:grand\\s*total|total\\s*(?:amount|value)|total|amount)\\s*[:#.\\-]?\\s*${CURRENCY_PATTERN}(${NUMBER_PATTERN})`,
  'i',
);
const AMOUNT_REGEX = new RegExp(`(?:rs\\.?|inr|₹)\\s*(${NUMBER_PATTERN})`, 'i');
const TAXABLE_REGEX = new RegExp(
  `(?:taxable\\s*(?:value|amount)|base\\s*amount|taxable)\\s*[:#.\\-]?\\s*${CURRENCY_PATTERN}(${NUMBER_PATTERN})`,
  'i',
);
const TAX_REGEX = new RegExp(
  `(?:total\\s*tax|tax\\s*(?:amount|amt|value)?|igst|cgst|sgst|cess)\\s*[:#.\\-]?\\s*${CURRENCY_PATTERN}(${NUMBER_PATTERN})`,
  'i',
);
const HSN_REGEX = /hsn(?:\s*(?:code|no|number))?\s*[:#.\-]?\s*([0-9]{4,8})/i;
const DUE_DATE_REGEX = /due(?:\s*date|\s*on)?\s*[:#.\-]?\s*(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/i;
const DATE_REGEX = /(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/;

export interface ParsedSms {
  gstin: string | null;
  invoiceNo: string | null;
  amount: number | null;
  taxableValue: number | null;
  taxAmount: number | null;
  hsn: string | null;
  dueDate: Date | null;
  confidence: number;
}

function matches(patterns: RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

function cleanToken(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/[.,;:]+$/, '').trim();
  return trimmed.length >= 2 ? trimmed : null;
}

function parseDate(dayRaw: string, monthRaw: string, yearRaw: string): Date | null {
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function matchDate(text: string, regex: RegExp): Date | null {
  const match = regex.exec(text);
  if (!match) return null;
  return parseDate(match[1]!, match[2]!, match[3]!);
}

export function isGstRelated(body: string, sender?: string | null): boolean {
  return (body ?? '').toLowerCase().includes('gst') || (sender ?? '').toLowerCase().includes('gst');
}

export function classifySms(body: string, sender?: string): SmsCategory {
  const text = `${body ?? ''} ${sender ?? ''}`;
  if (matches(RETURN_PATTERNS, text)) return 'GST_RETURN';
  if (matches(EWAY_PATTERNS, text)) return 'EWAY_BILL';
  if (matches(PAYMENT_PATTERNS, text)) return 'TAX_PAYMENT';
  if (matches(NOTICE_PATTERNS, text)) return 'GST_NOTICE';
  if (matches(INVOICE_PATTERNS, text)) return 'GST_INVOICE';
  if (isGstRelated(text)) return 'UNCLASSIFIED';
  return 'OTHER';
}

export function parseGstSms(body: string): ParsedSms {
  const text = body ?? '';
  const upper = text.toUpperCase();

  const gstin = GSTIN_REGEX.exec(upper)?.[0] ?? null;
  const invoiceNo = cleanToken(INVOICE_REGEX.exec(text)?.[1]);
  const totalAmount = TOTAL_REGEX.exec(text)?.[1];
  const amount = parseNumber(totalAmount ?? AMOUNT_REGEX.exec(text)?.[1]);
  const taxableValue = parseNumber(TAXABLE_REGEX.exec(text)?.[1]);
  const taxAmount = parseNumber(TAX_REGEX.exec(text)?.[1]);
  const hsn = HSN_REGEX.exec(text)?.[1] ?? null;
  const dueDate = matchDate(text, DUE_DATE_REGEX) ?? matchDate(text, DATE_REGEX);

  const fields = [gstin, invoiceNo, amount, taxableValue, taxAmount, hsn, dueDate];
  const matched = fields.filter((field) => field != null).length;
  const confidence = Math.round((matched / fields.length) * 100) / 100;

  return { gstin, invoiceNo, amount, taxableValue, taxAmount, hsn, dueDate, confidence };
}
