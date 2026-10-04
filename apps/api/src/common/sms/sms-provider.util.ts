export interface SmsTemplateContext {
  code: string;
  appName: string;
  variables?: Record<string, string> | null;
}

const TOKEN_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

const APP_NAME_ALIASES = new Set(['app name', 'app_name', 'appname']);
const CODE_ALIASES = new Set(['variable', 'otp', 'code', 'otp code', 'otp_code']);

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

// Replaces {{token}} placeholders in the configured message template. Reserved
// tokens resolve to the app name and the freshly generated OTP; any other token
// is looked up (case/whitespace-insensitively) in the operator-provided
// variables map. Unknown tokens are left untouched so misconfiguration is easy
// to spot in a test send.
export function renderSmsMessage(template: string, context: SmsTemplateContext): string {
  const variables = new Map<string, string>();
  for (const [key, value] of Object.entries(context.variables ?? {})) {
    variables.set(normalise(key), value);
  }

  return template.replace(TOKEN_PATTERN, (match, rawToken: string) => {
    const token = normalise(rawToken);
    if (APP_NAME_ALIASES.has(token)) return context.appName;
    if (CODE_ALIASES.has(token)) return context.code;
    const value = variables.get(token);
    return value === undefined ? match : value;
  });
}

export interface Ping4SmsRequest {
  method: string;
  url: string;
  query: Record<string, string>;
}

export interface SmsRenderInput {
  url: string;
  method: string;
  sender: string;
  route?: string | null;
  templateId?: string | null;
  header?: string | null;
  message: string;
  credentials: Record<string, string>;
  phone: string;
}

// Maps a canonical outbound SMS onto the ping4sms HTTP query-string contract.
// `header` is accepted as a fallback for the DLT sender/header id so operators
// can fill in either field.
export function buildPing4SmsRequest(input: SmsRenderInput): Ping4SmsRequest {
  const query: Record<string, string> = {
    key: input.credentials.key ?? '',
    sender: input.sender || input.header || '',
    number: input.phone,
    sms: input.message,
  };
  if (input.route) query.route = input.route;
  if (input.templateId) query.templateid = input.templateId;
  return { method: input.method || 'GET', url: input.url, query };
}

export function maskSecret(value: string): string {
  if (value.length <= 4) return '*'.repeat(value.length);
  if (value.length <= 8) return `${value.slice(0, 2)}${'*'.repeat(value.length - 4)}${value.slice(-2)}`;
  return `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 7, 12))}${value.slice(-3)}`;
}
