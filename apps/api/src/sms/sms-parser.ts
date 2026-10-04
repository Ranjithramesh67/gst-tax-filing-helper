import type { ReturnType, SmsCategory } from '@gstflow/types';

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

const GSTR_3B_REGEX = /\bgstr[\s\-_]*3\s*b\b/i;
const GSTR_1_REGEX = /\bgstr[\s\-_]*1\b/i;
const GSTR_9_REGEX = /\bgstr[\s\-_]*9\b/i;
const GSTR_ANY_REGEX = /\bgstr\b/i;

const MONTH_NAMES = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;
const MONTH_PERIOD_REGEX = new RegExp(
  `\\b(${MONTH_NAMES.join('|')})[a-z]*[,\\s'\\/\\-]*(\\d{4})\\b`,
  'i',
);
const LABELLED_PERIOD_REGEX =
  /(?:for|period|month(?:\s*of)?|return\s*period)\s*[:#\-]?\s*(0?[1-9]|1[0-2])[\/\-](\d{4})/i;
const BARE_PERIOD_REGEX = /(?:^|[^\d])(0?[1-9]|1[0-2])[\/\-](\d{4})(?![\d])/;
const QUARTER_REGEX = /\bq([1-4])\b[\s,]*(?:fy)?[\s\-]*(\d{4})(?:[\s\-]*(\d{2}))?/i;
// Indian FY quarter-end months: Q1→Jun, Q2→Sep, Q3→Dec, Q4→Mar (next year).
const QUARTER_END_MONTH: Record<number, { month: number; nextYear: boolean }> = {
  1: { month: 6, nextYear: false },
  2: { month: 9, nextYear: false },
  3: { month: 12, nextYear: false },
  4: { month: 3, nextYear: true },
};

const ARN_LABELLED_REGEX =
  /\b(?:arn|ack(?:nowledg(?:e?ment)?)?(?:\s*(?:ref|no|number))?|reference\s*(?:no|number|id))\s*[:#.\-]?\s*([A-Z0-9]{15})\b/i;
const ARN_GENERIC_REGEX = /\b([A-Z]{2}[0-9]{2}[A-Z0-9]{11})\b/;
const FILED_REGEX =
  /\b(?:successfully\s+filed|filed\s+successfully|filed|submitted|accepted)\b/i;
const LATE_FEE_REGEX = new RegExp(
  `(?:late\\s*fees?|penalt(?:y|ies))\\s*[:#.\\-]?\\s*${CURRENCY_PATTERN}(${NUMBER_PATTERN})`,
  'i',
);

export interface ParsedSms {
  gstin: string | null;
  invoiceNo: string | null;
  amount: number | null;
  taxableValue: number | null;
  taxAmount: number | null;
  hsn: string | null;
  dueDate: Date | null;
  returnType: ReturnType | null;
  period: string | null;
  arn: string | null;
  lateFee: number | null;
  filed: boolean;
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

function parseReturnType(text: string): ReturnType | null {
  if (GSTR_3B_REGEX.test(text)) return 'GSTR3B';
  if (GSTR_1_REGEX.test(text)) return 'GSTR1';
  if (GSTR_9_REGEX.test(text)) return 'GSTR9';
  if (GSTR_ANY_REGEX.test(text)) return 'OTHER';
  return null;
}

function monthNumber(raw: string): number | null {
  const index = MONTH_NAMES.indexOf(raw.slice(0, 3).toLowerCase() as (typeof MONTH_NAMES)[number]);
  return index >= 0 ? index + 1 : null;
}

function formatPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function parsePeriod(text: string): string | null {
  const named = MONTH_PERIOD_REGEX.exec(text);
  if (named) {
    const month = monthNumber(named[1]!);
    if (month) return formatPeriod(Number(named[2]), month);
  }

  const quarter = QUARTER_REGEX.exec(text);
  if (quarter) {
    const end = QUARTER_END_MONTH[Number(quarter[1])]!;
    const year = Number(quarter[2]) + (end.nextYear ? 1 : 0);
    return formatPeriod(year, end.month);
  }

  const labelled = LABELLED_PERIOD_REGEX.exec(text);
  if (labelled) return formatPeriod(Number(labelled[2]), Number(labelled[1]));

  const bare = BARE_PERIOD_REGEX.exec(text);
  if (bare) return formatPeriod(Number(bare[2]), Number(bare[1]));

  return null;
}

function parseArn(text: string, gstin: string | null): string | null {
  const labelled = ARN_LABELLED_REGEX.exec(text.toUpperCase());
  if (labelled?.[1]) return labelled[1];

  const generic = ARN_GENERIC_REGEX.exec(text.toUpperCase());
  if (generic?.[1] && generic[1] !== gstin) return generic[1];
  return null;
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
  const returnType = parseReturnType(text);
  const period = parsePeriod(text);
  const arn = parseArn(text, gstin);
  const lateFee = parseNumber(LATE_FEE_REGEX.exec(text)?.[1]);
  const filed = arn != null || FILED_REGEX.test(text);

  const fields = [
    gstin,
    invoiceNo,
    amount,
    taxableValue,
    taxAmount,
    hsn,
    dueDate,
    returnType,
    period,
    arn,
    lateFee,
  ];
  const matched = fields.filter((field) => field != null).length;
  const confidence = Math.round((matched / fields.length) * 100) / 100;

  return {
    gstin,
    invoiceNo,
    amount,
    taxableValue,
    taxAmount,
    hsn,
    dueDate,
    returnType,
    period,
    arn,
    lateFee,
    filed,
    confidence,
  };
}
