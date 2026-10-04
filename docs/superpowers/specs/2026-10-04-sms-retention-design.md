# SMS retention with encrypted archive

Date: 2026-10-04
Status: Implemented

## Problem

Captured GST SMS messages and their parsed data accumulate forever in the firm
portal and the client app. Firms and clients have no way to age old messages out,
and there is no separation between "out of the app" and "permanently gone". The
platform needs a super-admin controlled two-stage lifecycle: move old messages out
of the live inbox into a protected backup, then delete the backup after a longer
window. The retention window must be disclosed on the mobile consent screen.

## Design

### Policy

A generic `SystemSetting` row (`key = "sms.retention"`) stores:

- `enabled` — whether the background scheduler runs
- `archiveAfterDays` — messages older than this leave the live inbox
- `purgeBackupAfterDays` — archived copies older than this are deleted
  (`purgeBackupAfterDays >= archiveAfterDays`)

Defaults: disabled, 180 / 365 days. Only `SUPER_ADMIN` can read or write it.

### Archive store

New `SmsMessageArchive` table mirrors `SmsMessage` (`originalId`, `clientId`,
`deviceId`, `sender`, `bodyEncrypted`, `receivedAt`, `category`, `status`, `hash`,
`parsed`) and adds `archivedAt` and `purgeAt`. `bodyEncrypted` keeps the original
AES-256-GCM ciphertext, so the backup is encrypted at rest with no extra work.
Indexed on `purgeAt`, `(clientId, receivedAt)`, and `originalId`.

### Lifecycle

`RetentionService`:

- `preview()` reports live count, archive candidates, archived count, purge candidates.
- `run(actor, force)` — when enabled (or forced), copies messages older than the
  archive cutoff into `SmsMessageArchive` in batches of 500 (with their parsed GST
  data), deletes the live rows in the same transaction, then deletes archive rows
  whose `purgeAt` has passed. Only SMS + parsed data are affected; documents,
  invoices and filings are untouched.
- Scheduler runs on boot (after `RETENTION_INITIAL_DELAY_MS`) and every
  `RETENTION_INTERVAL_MS` (default 6h). `RETENTION_ENABLED=false` disables it.

### Surfaces

- Super admin: `GET/PUT /admin/settings/sms-retention`,
  `GET .../preview`, `POST .../run`; Settings page in the admin panel.
- Public: `GET /public/retention` returns the policy (no credentials) for the
  mobile consent screen, which now describes the retention and backup windows.
- Firm portal: SMS inbox gains an auto-refresh selector (Off/5s/10s/30s/60s),
  persisted per browser.

## Verification

- `retention.service.spec.ts` unit tests (defaults, update + audit, disabled skip,
  forced archive+purge, preview counts).
- `sms-retention.e2e-spec.ts` (RBAC, policy get/update/validation, preview, run,
  public endpoint).
- Mobile consent screen renders the live windows from `/public/retention`.
