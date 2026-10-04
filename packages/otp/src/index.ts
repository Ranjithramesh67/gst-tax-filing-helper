const KEYWORD = /\b(otp|one[\s-]?time[\s-]?password|verification[\s-]?code|security[\s-]?code|login[\s-]?code|verification|verify|code)\b/i;
const GST_NOISE = /\b(gstin|gstn|gstr|arn|invoice|hsn|tax|amount|rs\.?)\b/i;
const TOKEN = /\b[A-Za-z0-9]{4,8}\b/g;
const WINDOW = 160;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ExtractedOtp {
  code: string;
  snippet: string;
}

export function extractOtp(input: string): ExtractedOtp | null {
  if (!input) return null;
  const match = KEYWORD.exec(input);
  if (!match) return null;
  const windowStart = Math.max(0, match.index - WINDOW);
  const window = input.slice(windowStart, match.index + WINDOW);
  if (GST_NOISE.test(window)) return null;
  const keywordPos = match.index - windowStart;
  const candidates = [...window.matchAll(TOKEN)]
    .filter((found) => /[0-9]/.test(found[0]) && !/^(otp|code)$/i.test(found[0]))
    .map((found) => {
      const index = found.index ?? 0;
      return {
        value: found[0],
        distance: Math.abs(index - keywordPos),
        after: index >= keywordPos,
      };
    })
    .sort((a, b) => a.distance - b.distance || Number(b.after) - Number(a.after));
  const token = candidates[0]?.value;
  if (!token) return null;
  const start = Math.max(0, match.index - 40);
  const end = Math.min(input.length, match.index + 120);
  const mask = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'g');
  const snippet = input
    .slice(start, end)
    .replace(mask, '••••')
    .replace(/\s+/g, ' ')
    .trim();
  return { code: token.toUpperCase(), snippet };
}
