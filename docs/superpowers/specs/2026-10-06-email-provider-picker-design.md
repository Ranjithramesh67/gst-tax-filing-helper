# Email Provider Picker — Design

Status: approved (brainstorming), pending implementation plan
Date: 2026-10-06
Author: monkeycode-ai
Related:
- `docs/superpowers/specs/2026-10-04-email-otp-aggregation-design.md` (parent feature)
- `docs/superpowers/plans/2026-10-04-email-otp-aggregation-progress.md` (carry-forward gap: "EmailSettingsScreen exposes only IMAP add")

## Problem

The mobile email settings screen (`apps/mobile/src/screens/Email/EmailSettingsScreen.tsx`)
only lets a user add a generic IMAP account by typing the host and port by hand.
Two problems:

1. Non-technical users do not know their provider's IMAP host/port.
2. The Gmail and Microsoft Graph OAuth link flows were built in Tasks 15/16
   (`EmailAccounts.linkGmail()` / `linkGraph()`, `GmailLinkActivity`,
   `GraphLinkActivity`) but **no UI ever calls them**, so Gmail/Outlook cannot be
   linked from the app at all.

## Goal

Make linking a mailbox easy by presenting a small provider picker. Selecting a
provider either pre-fills the IMAP form (for password-based providers) or starts
the existing OAuth sign-in (for Gmail/Outlook). Keep manual entry available for
anything not listed.

## Non-goals

- Outgoing mail / SMTP (the product only reads OTP email; IMAP-only).
- Autoconfig / DNS-based auto-discovery.
- Server-managed or remotely-updatable provider presets.
- Making Gmail/Outlook actually succeed — that still requires external
  credentials (see "External prerequisites"), which are out of scope here.
- Changing the consent switch, the linked-accounts list, existing validation, or
  the on-device privacy model.

## Provider catalog

A static, offline catalog lives in a new pure module
`apps/mobile/src/lib/emailProviders.ts`. It contains no secrets and performs no
I/O, so it is trivially unit-testable.

| id | Label | Action | Host | Port | Password label | Helper line |
|----|-------|--------|------|------|----------------|-------------|
| `gmail` | Gmail | OAuth (`linkGmail`) | — | — | — | Sign in with Google. Your password is never stored. |
| `outlook` | Outlook / Microsoft 365 | OAuth (`linkGraph`) | — | — | — | Sign in with Microsoft. Your password is never stored. |
| `zoho` | Zoho Mail | IMAP | `imap.zoho.com` | 993 | App password | Custom-domain Zoho accounts use `imappro.zoho.com`; Zoho India uses `imap.zoho.in`. Enable IMAP access; use an app password if 2FA is on. |
| `godaddy` | GoDaddy email | IMAP | `imap.secureserver.net` | 993 | Password | Works for Workspace and Professional Email. If your plan is Microsoft 365, choose Outlook above. |
| `hostinger` | Hostinger email | IMAP | `imap.hostinger.com` | 993 | Password | Use your mailbox password. |
| `other` | Other / manual | IMAP | (empty) | 993 | Password | Enter your provider's IMAP host and port. |

Sources verified 2026-10-06:
- Zoho: https://www.zoho.com/mail/help/imap-access.html
- GoDaddy: https://www.godaddy.com/en-in/help/use-imap-settings-to-add-my-professional-email-powered-by-titan-to-a-client-32204
- Hostinger: https://www.hostinger.com/support/1575756-how-to-get-email-account-configuration-details-for-hostinger-email/

Rationale for the two OAuth entries: Gmail blocks normal-password IMAP (app
passwords only, and those require 2FA), and Microsoft disabled basic-auth IMAP
entirely (Sept 2022). Routing those two through the existing OAuth connectors is
the only reliable path.

Types:

```ts
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
export const EMAIL_PROVIDER_PRESETS: readonly EmailProviderPreset[];
export function presetFor(id: EmailProviderId): EmailProviderPreset;
```

## UI

`EmailSettingsScreen.tsx`, inside the existing "Add account" card:

1. A horizontal, scrollable row of provider **chips** (one per catalog entry).
   The new presentational component `apps/mobile/src/components/ProviderChips.tsx`
   renders the row and reports selection. Default selection is **`other`**, so the
   screen looks and behaves like today until the user picks something.
2. Below the chips:
   - **IMAP providers** (`zoho`, `godaddy`, `hostinger`, `other`): render the
     existing address / password / host / port fields. A newly selected preset
     pre-fills host (unless `other`) and port; both stay editable. The password
     label comes from the preset (`App password` for Zoho, `Password` otherwise).
     The submit button stays "Add account" and calls the existing
     `EmailAccounts.addImapAccount(...)`.
   - **OAuth providers** (`gmail`, `outlook`): hide the password/host/port fields;
     show a single button labelled "Sign in with Google" / "Sign in with
     Microsoft". Pressing it calls `EmailAccounts.linkGmail()` /
     `linkGraph()`. The native activity owns the sign-in UI; on resolve we reload
     the accounts list and show "Account linked."
3. Selection is **not persisted**: every time the screen mounts, it defaults to
   `other`. Accounts are added rarely and this avoids extra storage state.
4. Switching providers clears transient form errors and the password field, and
   resets host/port to the new preset's values (empty host + 993 for `other`).

The password policy is unchanged: the password is never held after a submit
attempt, is sent only to the native encrypted store, and is never returned.

## OAuth handling

`EmailAccounts.linkGmail()` / `linkGraph()` return a promise that resolves
`{ok:true}` and rejects with a `code` + human message from
`EmailAccountModule`:

| code | Screen message |
|------|----------------|
| `LINK_CANCELLED` | "Sign-in was cancelled." |
| `IN_PROGRESS` | "A sign-in is already in progress." |
| `NO_ACTIVITY` | "Could not start sign-in. Please try again." |
| `LINK_FAILED` / other | the rejection message, else "Could not link the account." |

A per-button busy flag prevents double taps. After resolve or reject, the
accounts list is reloaded.

## Data flow

```
provider chips (state: selectedProvider)
        |
        +-- oauth --> EmailAccounts.linkGmail()/linkGraph()
        |                 -> native activity -> resolve {ok} or reject {code}
        |                 -> reload list + notice
        |
        +-- imap  --> prefilled, editable host/port
                          -> EmailAccounts.addImapAccount(...)  (unchanged)
                          -> reload list + notice
```

## Error handling

- IMAP validation is unchanged (address format, non-empty password/host, port
  1-65535).
- OAuth rejection codes are mapped as in the table above.
- If `EmailAccounts.isAvailable` is false (non-Android), the existing notice is
  shown and buttons are inert.

## Testing

- Unit test the pure catalog in `emailProviders.spec.ts`: exactly six entries,
  unique ids, every `imap` entry has a port in range, `oauth` entries carry no
  host/port, `presetFor` returns the right entry and throws on unknown ids. Runs
  under the mobile jest setup: `babel.config.js` uses
  `@react-native/babel-preset` (transforms TS), and the module has no RN imports,
  so it executes in jest's default node environment. `tsconfig.json` includes
  `*.spec.ts`, so `tsc` also typechecks it (`@types/jest` supplies the globals).
- Mobile `npm run typecheck`.
- Manual device QA: select each chip; confirm prefill + editability; confirm
  Gmail/Outlook show the sign-in button and that a cancellation shows the mapped
  message; confirm an IMAP add still works end to end.

## External prerequisites (unchanged, blocking real OAuth)

- Google Cloud Android OAuth client (package name + SHA-1) with `gmail.readonly`.
- Azure app registration with delegated `Mail.Read`; its client_id replaces the
  `00000000-...` placeholder in `apps/mobile/android/app/src/main/res/raw/msal_config.json`.

Until these exist, Gmail/Outlook will fail at runtime with a native error that
the screen surfaces as a friendly notice. This is expected and acceptable.

## Files

- New: `apps/mobile/src/lib/emailProviders.ts`
- New: `apps/mobile/src/lib/emailProviders.spec.ts`
- New: `apps/mobile/src/components/ProviderChips.tsx`
- Edit: `apps/mobile/src/screens/Email/EmailSettingsScreen.tsx`
- Unchanged (already wired): `apps/mobile/src/native/EmailAccounts.ts`,
  `apps/mobile/android/.../EmailAccountModule.kt`,
  `GmailLinkActivity.kt`, `GraphLinkActivity.kt`
