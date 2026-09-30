import type { SmsCategory } from '@gstflow/types';

const GST_KEYWORDS = [
  'gst',
  'g.s.t',
  'gstin',
  'gstr',
  'e-way',
  'eway',
  'e-invoice',
  'tax',
  'invoice',
  'hsn',
  'igst',
  'cgst',
  'sgst',
  'cess',
  'input credit',
  'itc',
];

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
const AMOUNT_REGEX = /(?:rs\.?|inr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const TAXABLE_REGEX =
  /(?:taxable\s*(?:value|amount)|base\s*amount)\s*[:#.\-]?\s*(?:rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
const TAX_REGEX =
  /(?:tax\s*(?:amount|amt)|igst|cgst|sgst|total\s*tax)\s*[:#.\-]?\s*(?:rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
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

export function isGstRelated(body: string): boolean {
  const text = (body ?? '').toLowerCase();
  return GST_KEYWORDS.some((keyword) => text.includes(keyword));
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
  const amount = parseNumber(AMOUNT_REGEX.exec(text)?.[1]);
  const taxableValue = parseNumber(TAXABLE_REGEX.exec(text)?.[1]);
  const taxAmount = parseNumber(TAX_REGEX.exec(text)?.[1]);
  const hsn = HSN_REGEX.exec(text)?.[1] ?? null;
  const dueDate = matchDate(text, DUE_DATE_REGEX) ?? matchDate(text, DATE_REGEX);

  const fields = [gstin, invoiceNo, amount, taxableValue, taxAmount, hsn, dueDate];
  const matched = fields.filter((field) => field != null).length;
  const confidence = Math.round((matched / fields.length) * 100) / 100;

  return { gstin, invoiceNo, amount, taxableValue, taxAmount, hsn, dueDate, confidence };
}
