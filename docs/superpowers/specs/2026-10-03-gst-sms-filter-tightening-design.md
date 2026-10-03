# GST SMS Filter Tightening

Date: 2026-10-03

## Problem

The on-device capture filter matched a broad keyword list (`gst`, `tax`, `invoice`,
`paid`, `bill`, `hsn`, ...). On a real device this matched ~101 inbox messages, most of
which were not GST messages. Those messages would be encrypted, uploaded, and shown in
the firm portal.

## Decision

Capture a message only when **the sender (header) contains `GST` OR the body contains
`GST`**, case-insensitive substring. This covers `GST`, `GSTIN`, `GSTR`, `GSTN`.

The rule is intentionally literal: no OTP/verification exclusion. A GST-portal OTP that
contains `GST` will match.

## Scope

The rule must be identical in the three synced copies:

| Copy | File | Role |
|------|------|------|
| Kotlin | `apps/mobile/android/app/src/main/java/com/gstflow/client/sms/SmsBroadcastReceiver.kt` (`GstFilter`) | Native capture gate (receiver, foreground service, inbox backfill) |
| JS | `apps/mobile/src/lib/gstFilter.ts` | Client mirror / classifier |
| Server | `apps/api/src/sms/sms-parser.ts` | Classification fallback |

Note: the server does not gate ingest on `isGstRelated`; it only uses it inside
`classifySms`. Tightening it cannot drop ingested rows.

### Signature change

`isGstRelated(sender, body)` replaces `isGstRelated(body)` so the sender header can match.
Callers updated:

- `SmsBroadcastReceiver.onReceive` -> pass `part.sender`
- `SmsForegroundService` `ACTION_INGEST` -> pass `sender`
- `SmsReaderModule.getRecentGstSms` -> read `sender` before the check and pass it
- `classifySms` internal fallback -> pass the combined text

## Consent Copy

The consent screen previously promised that OTP messages are never read and listed
invoice/tax keywords. That wording no longer matches the literal rule, so the copy is
updated to describe GST-sender/GST-mention capture accurately. `CONSENT_VERSION` is not
bumped because the collection scope only narrows relative to the earlier disclosure.

## Consequences

- Inbox backfill returns only genuine GST messages; the portal flood disappears.
- Live capture takes effect only after a native rebuild, so one debug-APK reinstall is
  required. The JS bundle is regenerated and served remotely.
- Previously stored broad rows are left in place (no deletions).

## Verification

- `apps/api` unit tests (`sms-parser.spec.ts`) extended and passing; e2e passing.
- TypeScript typecheck for mobile + API.
- Rebuild JS bundle and APK; confirm served over the preview host.
- Native capture cannot be runtime-tested (no emulator/KVM); verified by build and review.
