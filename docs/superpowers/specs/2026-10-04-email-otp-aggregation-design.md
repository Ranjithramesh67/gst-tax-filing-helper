# Email + SMS OTP aggregation and cross-channel grouping

Date: 2026-10-04
Status: Approved (design) - not yet implemented
Branch: `260930-feat-gstflow-platform`

## Problem

Clients receive login / verification OTPs by SMS and, when SMS is delayed or
undelivered, by email. Today the phone only captures SMS and forwards the full
message body to the firm, and the firm sees every SMS as a raw message row with a
separate "OTP" column. There is no email reading at all, and identical OTPs that
arrive on both channels produce two unrelated entries.

We want the phone to also read the client's mailbox, extract OTPs, and forward a
compact OTP event to the firm. When the same OTP arrives on both SMS and email it
must be shown as a single grouped item, with the latest occurrence driving the
displayed time.

## Decisions (agreed with product owner)

1. **Providers:** Gmail (OAuth), Microsoft Graph (OAuth), and generic IMAP +
   app-password. All three delivered together behind one connector interface.
2. **Where:** Reading and OTP extraction happen **on the phone** (native), so
   mailbox credentials and OAuth tokens never leave the device.
3. **Payload:** Only the OTP plus short context is forwarded - code, source,
   from/sender, subject, ~120-char snippet, received time. **Full email body is
   never uploaded.** (This mirrors the privacy stance of the SMS pipeline.)
4. **Grouping:** Same code arriving within a short rolling window (default 5
   minutes) across SMS/email collapses to one item. Newest occurrence wins; both
   source badges are shown. Different codes stay separate.
5. **Surfaces:** The compact OTP card + grouping appears in **both** the firm web
   inbox (`/sms`) and the client mobile log (`SmsLogScreen`).
6. **Reliability:** Email polling must keep working when the app is killed, reusing
   the existing foreground service + `JobScheduler` retry pattern.
7. **Feed source:** The grouped feed is **server-backed for both UIs**. The mobile
   log fetches the same grouped feed as the firm and overlays its not-yet-synced
   locally-queued SMS on top, rather than computing grouping on the phone. One
   grouping implementation, client and firm always agree; offline shows the queued
   overlay only.

## Architecture

```
Phone (native; works when app killed)
  SmsBroadcastReceiver ─────────────┐
  EmailPoller (Gmail/Graph/IMAP) ───┤
      │  EncryptedSharedPreferences  │
      │  (app password / OAuth tokens)
      └→ OTP extraction (Kotlin) → EmailOtpOutbox
              (code + from + subject + bounded snippet)
                    │
                    └── POST /otp/ingest ──────────────┐
Server                                                 │
  sms.ingest → extract OTP from SMS body (TS) ─────────┤
  OtpGroupingService (same code within window) ←───────┘
      → OtpEvent rows (source SMS | EMAIL)
  GET /inbox → unified, grouped feed
                    │
     Firm web /sms ─┴─ Mobile SmsLog (server feed + local queued overlay)
              compact OTP card, source badges, one grouped row
```

The grouped feed is **server-backed for both UIs** (decision 7). `SmsLogScreen`
stops rendering its locally-merged raw SMS list and instead shows the server feed,
with not-yet-synced locally-queued SMS overlaid at the top. This is what makes
"compare both channels, show one latest" consistent between the firm and client.

## Data model (additive)

```prisma
enum OtpSource {
  SMS
  EMAIL
}

model OtpEvent {
  id          String    @id @default(cuid())
  firmId      String
  clientId    String
  deviceId    String?
  code        String
  source      OtpSource
  fromAddress String?   // SMS sender or email From
  subject     String?   // email subject
  snippet     String?   // ~120 chars around the code (code masked)
  receivedAt  DateTime
  sourceRef   String?   // SmsMessage.id or provider message id
  groupId     String?   // self id when new; else the group's id
  createdAt   DateTime  @default(now())

  @@unique([clientId, source, sourceRef])
  @@index([firmId, receivedAt])
  @@index([clientId, code, receivedAt])
  @@index([groupId])
}
```

- No new fields are required on `SmsMessage`; OTPs discovered in SMS are projected
  into `OtpEvent` rather than mutating the SMS row.
- **Grouping at ingest.** On a new event, find the latest `OtpEvent` for
  `(clientId, code)` whose `receivedAt` is within the window; if found, reuse its
  `groupId`, otherwise set `groupId = own id`. Window from `SystemSetting`
  `otp.groupWindowSeconds` (default `300`).
- **Backfill.** A one-time job extracts OTPs from existing `SmsMessage` bodies and
  creates `OtpEvent(source=SMS, sourceRef=smsId, receivedAt=... )` so history
  participates in grouping. Idempotent via the unique key.

## OTP extraction (canonical)

- Promote the web UI's `extractOtp`
  (`apps/web/components/sms/classification.ts`) into a shared module
  `packages/otp` (published as `@gstflow/otp`) and extend it:
  - Keyword set: `otp`, `one-time password`, `one time password`,
    `verification code`, `security code`, `login code`, `code is`, `use ... to`.
  - Candidate tokens: 4-8 alphanumeric chars containing at least one digit.
  - Exclusions: GST/amount/invoice/GSTIN/ARN contexts (reuse the GST parser hints)
    to avoid false positives.
  - Returns `{ code, snippet }`, snippet = ~120 chars around the match with the
    code masked (`••••`).
- **Kotlin mirror** of the extractor for the native email poller - required
  because extraction must run with no JS. Parity is enforced by a shared fixture
  file consumed by both the TS and Kotlin test suites
  (`packages/otp/fixtures/otp-fixtures.json`).
- Server runs the TS extractor on incoming SMS bodies (inside `sms.ingest`) and on
  the backfill; mobile JS uses it for the queued (not-yet-synced) local overlay.

## Email connectors (native Kotlin)

A common interface, implemented per provider:

```kotlin
interface EmailConnector {
  fun link(activity): Promise        // OAuth or app-password entry
  fun unlink()
  fun status(): LinkStatus           // email, provider, lastPolledAt, error?
  fun listOtpCandidates(since: Cursor): List<RawMail>
}
```

- **IMAP + app password** - Jakarta Mail for Android over SSL. INBOX only,
  search since cursor. App password entered in-app.
- **Gmail** - native Google Sign-In, then Gmail REST
  `users.messages.list?q=...` + `users.messages.get`. Requires a Google Cloud
  OAuth client (Android package + SHA-1) and Gmail readonly scope.
- **Microsoft Graph** - native MSAL sign-in, then `/me/messages`. Requires an
  Azure app registration (and tenant admin consent for org mail).

Storage: `EncryptedSharedPreferences` backed by the Android Keystore. Credentials
and tokens are **never** sent to the server. Poll cursor (last UID / history id)
is persisted per account to avoid re-reading.

Background: reuse `SmsForegroundService`; add `EmailRetryJobService` (JobScheduler,
network-constrained, persisted) mirroring `SmsRetryJobService`. Poll every ~15 min
and on connectivity change. Uses the already-mirrored refresh token to rotate the
access token when needed (see the native token-refresh work in commit `66fc7f2`).

## API (additive)

- `POST /otp/ingest` (`CLIENT`) - body:
  `{ items: [{ code, source: 'EMAIL', fromAddress, subject, snippet, receivedAt, deviceId?, sourceRef }] }`.
  Idempotent via the unique key; resolves the linked ACTIVE firm like `sms.ingest`.
- `sms.ingest` additionally extracts OTPs from each accepted SMS and creates
  `OtpEvent(source=SMS)`.
- `GET /inbox` - unified paginated feed. Item is discriminated:
  - `kind: 'OTP'` → `{ code, sources: ['SMS','EMAIL'], from, subject, snippet,
    receivedAt, latestAt, eventCount }` (a group).
  - `kind: 'SMS'` → the existing message shape for non-OTP SMS.
- `GET/PUT /admin/settings/otp` (`SUPER_ADMIN`) - `groupWindowSeconds`,
  `emailEnabled`, `providersEnabled`.
- `GET /otp/accounts` / native link/unlink are device-side; the server only needs
  to know whether email capture is enabled for the client.
- Types/schemas: additive additions to `@gstflow/types` and
  `@gstflow/api-client` (rebuild `dist` after editing shared packages).

## UI

- **Firm web `/sms`** - OTP rows render a compact card: prominent code, source
  badges (SMS / Email), from + subject, snippet, received time; a grouped row
  shows both badges and the latest time. Non-OTP SMS rows are unchanged. The
  message detail page lists the grouped events.
- **Mobile `SmsLogScreen`** - server-backed grouped feed with the local queued
  overlay; same OTP card layout. A new "Email accounts" settings screen links
  Gmail/Outlook/IMAP and shows poll status + last error.
- **Consent** - a one-time email-reading consent screen stored like the SMS
  consent, plus per-account disconnect. Email capture is off until consent.

## Privacy / security / compliance

- Only OTP + bounded snippet leaves the device; full email body never does.
- `OtpEvent` rows are scoped by `firmId`; cross-firm access returns 404 (matches
  the existing tenant rule). The `snippet` column is encrypted at rest with the
  existing `CryptoService` (same approach as `SmsMessage.bodyEncrypted`); the code
  stays plaintext so grouping is indexable.
- Consent-gated, per-account revocable, and disabled by default.
- **External prerequisites / risks to track:**
  - Google treats Gmail read as a **restricted scope**: production OAuth needs
    app verification (and possibly a security assessment), which can take weeks.
    Test users work meanwhile. Play Store distribution also has an email-access
    policy; direct APK distribution avoids the Play policy but not API
    verification.
  - Azure org mail needs tenant **admin consent**.
  - IMAP has none of these and is the universal fallback.

## Testing

- Shared extraction fixtures (TS + Kotlin), including false positives
  (GST amounts, invoice numbers, ARNs).
- Server unit/e2e: grouping window boundaries; idempotent `/otp/ingest`; SMS +
  email same code merge into one group; `GET /inbox` shape; cross-firm 404.
- Native: connector parsing and poll cursor with mocked HTTP / IMAP.
- Manual matrix: SMS only → one card; email only → one card (Email badge); both →
  one grouped card with the latest time.

## Implementation order (suggested)

1. `@gstflow/otp` package + TS extractor + fixtures; unit tests.
2. `OtpEvent` model/migration; server extraction inside `sms.ingest`; grouping
   service; backfill job.
3. `POST /otp/ingest` + `GET /inbox` + admin `otp` settings; e2e tests.
4. Firm web `/sms` compact OTP card + grouped rows.
5. Native email framework: connector interface, EncryptedSharedPreferences
   storage, consent, `EmailRetryJobService`, `EmailOtpOutbox`.
6. IMAP connector (unblocks all providers; no external approval).
7. Gmail OAuth + Graph connectors.
8. Kotlin extractor + fixtures parity; mobile `SmsLogScreen` server feed + email
   settings screen.
9. Build, test, deploy, republish APK.

## Out of scope (YAGNI)

Non-OTP email into the inbox; sending/replying to email; attachments; server-side
mailbox polling; push (we poll).

## Continuation notes for other models

- Repo: GSTFlow monorepo, npm workspaces. Shared packages are additive-only and
  must be rebuilt (`npm run build --workspace @gstflow/<pkg>`) after edits.
- Existing SMS pipeline to mirror: `apps/mobile/android/app/src/main/java/com/gstflow/client/sms/`
  (`SmsBroadcastReceiver.kt`, `SmsUploader.kt`, `SmsOutbox.kt`, `SmsRetryJobService.kt`,
  `SmsReaderModule.kt`) and JS wrappers `apps/mobile/src/native/SmsReader.ts`,
  `apps/mobile/src/lib/{smsCollector,smsQueue,smsSync}.ts`.
- Server SMS code: `apps/api/src/sms/{sms.service.ts,sms-parser.ts}`;
  `SmsMessage` in `apps/api/prisma/schema.prisma`.
- Ingest DTO: `packages/validation/src/sms.ts`, `packages/types/src/api.ts`.
- Web inbox: `apps/web/app/[firm]/(dashboard)/sms/page.tsx`; the existing
  `extractOtp` lives in `apps/web/components/sms/classification.ts`.
- Native background constraints learned earlier: Android 12+ blocks starting a
  foreground service from the background; use `goAsync()` + a persisted
  `JobScheduler` job. `RECEIVE_BOOT_COMPLETED` is needed for reboot persistence.
- Production access is via Apache vhost + certbot on
  `https://gst.keerainnovations.com` (`/admin`, `/api` → API :4000/v1). APKs are
  published to `apps/web/public/gstflow-client.apk` and
  `gstflow-client-arm64.apk`.
- After implementation, follow the repo's verification + deploy routine used for
  the SMS work (typecheck, unit + e2e, rebuild APK with `--rerun-tasks`, rsync,
  `pm2 restart`).
