const KEYWORD = /\b(otp|one[\s-]?time[\s-]?password|verification[\s-]?code|security[\s-]?code|login[\s-]?code|verification|verify|code)\b/i;
const GST_NOISE = /\b(gstin|gstn|gstr|arn|invoice|hsn|tax|amount|rs\.?)\b/i;
const TOKEN = /\b[A-Za-z0-9]{4,8}\b/g;

export interface ExtractedOtp {
  code: string;
  snippet: string;
}

export function extractOtp(input: string): ExtractedOtp | null {
  if (!input) return null;
  const match = KEYWORD.exec(input);
  if (!match) return null;
  const tail = input.slice(match.index, match.index + 160);
  if (GST_NOISE.test(tail)) return null;
  const window = input.slice(Math.max(0, match.index - 160), match.index + 160);
  const tokens = window.match(TOKEN) ?? [];
  const token = tokens.find((value) => /[0-9]/.test(value) && !/^(otp|code)$/i.test(value));
  if (!token) return null;
  const start = Math.max(0, match.index - 40);
  const end = Math.min(input.length, match.index + 120);
  const snippet = `${input.slice(start, end).replace(token, '••••')}`.replace(/\s+/g, ' ').trim();
  return { code: token.toUpperCase(), snippet };
}
