/**
 * Static catalog of supported email providers for the settings picker.
 *
 * Pure and offline: no secrets, no network. Gmail and Outlook route to the
 * native OAuth link flows because neither supports password-based IMAP
 * (Microsoft disabled basic auth entirely; Google requires app passwords).
 */

export type EmailProviderId = 'gmail' | 'outlook' | 'zoho' | 'godaddy' | 'hostinger' | 'other';

export type EmailProviderAction = 'oauth' | 'imap';

export interface EmailProviderPreset {
  id: EmailProviderId;
  label: string;
  action: EmailProviderAction;
  host?: string;
  port?: number;
  passwordLabel?: string;
  helper: string;
}

export const EMAIL_PROVIDER_PRESETS: readonly EmailProviderPreset[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    action: 'oauth',
    helper: 'Sign in with Google. Your password is never stored.',
  },
  {
    id: 'outlook',
    label: 'Outlook / Microsoft 365',
    action: 'oauth',
    helper: 'Sign in with Microsoft. Your password is never stored.',
  },
  {
    id: 'zoho',
    label: 'Zoho Mail',
    action: 'imap',
    host: 'imap.zoho.com',
    port: 993,
    passwordLabel: 'App password',
    helper:
      'Custom-domain Zoho accounts use imappro.zoho.com; Zoho India uses imap.zoho.in. Enable IMAP access; use an app password if 2FA is on.',
  },
  {
    id: 'godaddy',
    label: 'GoDaddy email',
    action: 'imap',
    host: 'imap.secureserver.net',
    port: 993,
    passwordLabel: 'Password',
    helper:
      'Works for Workspace and Professional Email. If your plan is Microsoft 365, choose Outlook above.',
  },
  {
    id: 'hostinger',
    label: 'Hostinger email',
    action: 'imap',
    host: 'imap.hostinger.com',
    port: 993,
    passwordLabel: 'Password',
    helper: 'Use your mailbox password.',
  },
  {
    id: 'other',
    label: 'Other / manual',
    action: 'imap',
    port: 993,
    passwordLabel: 'Password',
    helper: "Enter your provider's IMAP host and port.",
  },
];

export function presetFor(id: EmailProviderId): EmailProviderPreset {
  const preset = EMAIL_PROVIDER_PRESETS.find((entry) => entry.id === id);
  if (!preset) throw new Error(`Unknown email provider: ${id}`);
  return preset;
}
