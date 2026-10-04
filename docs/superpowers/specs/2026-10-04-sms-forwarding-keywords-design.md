# Killed-app SMS forwarding with server-driven keyword whitelist

Date: 2026-10-04
Status: Implemented

## Problem

A matched SMS was only forwarded while the React app was alive. The manifest
receiver started a `dataSync` foreground service, but Android 12+ (targetSdk 34)
blocks starting a foreground service from the background unless the app holds an
exemption. When the app was killed, the broadcast was delivered, the service start
was denied, and the message never reached the backend.

In addition, the capture rule was hard-coded ("body or sender contains `gst`") and
could not be curated, and a super admin had no way to see messages across firms.

## Design

### Forwarding without a foreground service

`SmsBroadcastReceiver` now calls `goAsync()` and does the work on a short-lived
background thread:

1. Reassemble multipart parts and match against the keyword whitelist.
2. Hand each match to JS (`SmsReaderModule.dispatch`) when a React instance is
   attached; otherwise it is buffered for the next app open.
3. Attempt a direct upload with short timeouts (8s).
4. On failure, persist the message to `SmsOutbox` and schedule
   `SmsRetryJobService`.

`SmsRetryJobService` drains the outbox with a network-constrained, persisted
`JobScheduler` job. Jobs run in the background without a foreground service and
survive the process being killed, so a message captured while the app was dead is
forwarded as soon as connectivity returns. The server de-duplicates by
`(clientId, hash)`, so retries are idempotent.

### Server-driven keyword whitelist

A `SystemSetting` row (`key = "sms.keywords"`) stores `bodyKeywords`,
`headerKeywords` and `hideAfterForward`. Defaults preserve the legacy rule
(`bodyKeywords = ["gst"]`, no header keywords, no hiding). Keywords are trimmed,
blank-stripped and de-duplicated case-insensitively on save. An explicitly empty
body list forwards nothing.

The mobile app fetches `GET /public/sms-keywords` and mirrors it to native storage
(`SmsReader.setSmsKeywords`). `SmsKeywords` (Kotlin) applies the same match rule
natively, so filtering works with no JS running. `hideAfterForward` triggers a
guarded `abortBroadcast()` after a match; this only takes effect when GSTFlow is the
device's default SMS app.

### Super-admin viewer

`GET /admin/sms` lists every forwarded message across all firms (firm, client,
sender, decrypted body, category, status) with filters and pagination. The admin
"Settings" page manages the keyword whitelist and "SMS Messages" browses the
cross-firm feed.

## Endpoints

- `GET/PUT /admin/settings/sms-keywords` (`SUPER_ADMIN`)
- `GET /public/sms-keywords` (public, for devices)
- `GET /admin/sms` (`SUPER_ADMIN`)

## Notes / limitations

- True SMS hiding requires being the default SMS app; the toggle is implemented
  but is a no-op for non-default installs (the abort is guarded and logged).
- The retry job needs `RECEIVE_BOOT_COMPLETED` to remain persisted across reboots.
