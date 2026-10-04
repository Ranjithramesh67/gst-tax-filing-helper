# Outbound OTP SMS via ping4sms — Design Spec

Date: 2026-10-04
Status: Approved

## 1. Problem

OTP requests only create a hashed record, log the code and (in dev) echo it back.
There is no outbound SMS delivery, so a real party cannot receive their OTP.

## 2. Scope

In scope:

- A reusable `SmsGatewayService` that sends the OTP DLT template through the
  ping4sms HTTP API.
- Config-driven credentials and template; no secrets in source.
- `OtpService.request()` sends the SMS when the gateway is enabled, without
  blocking OTP creation on delivery failure.
- Unit tests with a mocked `fetch`.

Out of scope: delivery receipts, retries/outbox, provider webhooks, non-OTP
outbound SMS (reminders keep using `NOTIFY_WEBHOOK_URL`).

## 3. Configuration

| Env var | Default | Purpose |
|---|---|---|
| `SMS_GATEWAY_ENABLED` | `false` | Master switch; off in dev/tests |
| `SMS_GATEWAY_URL` | `http://site.ping4sms.com/api/smsapi` | Provider endpoint |
| `SMS_GATEWAY_KEY` | - | Provider apikey |
| `SMS_GATEWAY_SENDER` | `VHOMEE` | DLT sender ID |
| `SMS_GATEWAY_ROUTE` | `4` | Transactional route |
| `SMS_GATEWAY_TEMPLATE_ID` | `1207170351303889084` | DLT template |
| `SMS_GATEWAY_APP_NAME` | `GSTFlow` | `{{app name}}` substitution |
| `SMS_GATEWAY_TIMEOUT_MS` | `8000` | Abort timeout |

`Header: 123456789011213` from the provider note is intentionally unused; the
ping4sms API call only needs the six parameters used in the sample.

## 4. Message Template

```
Hi, Your OTP to Login into <app name> App is <code>. This OTP is sent by Ranji,
Please don't share this OTP with anyone. This OTP will expire in 2Mins.
```

## 5. Design

`SmsGatewayService` (global `SmsGatewayModule`, mirroring `CryptoModule`):

- `sendOtp(phone, code)` builds the message and issues
  `GET {url}?key&sender&number&route&sms&templateid` using Node's built-in
  `fetch` with an `AbortController` timeout.
- Returns `{ ok: boolean; status?: number; skipped?: boolean }`; never throws.
- When `SMS_GATEWAY_ENABLED` is false or the key is missing it returns
  `{ ok: false, skipped: true }` after logging a debug line.

`OtpService.request()` keeps its current behaviour (record, audit, dev echo) and
additionally awaits `smsGateway.sendOtp(phone, code)`; failures are logged only.
The OTP record is created regardless, so a provider outage never breaks login.

## 6. Testing

- Disabled or missing-key → `skipped`, `fetch` not called.
- Enabled → correct URL/host and query params, and message substitution.
- Non-2xx and network error → `ok: false`, no throw.
- `OtpService.request` invokes the gateway with the generated code when enabled.

## 7. Deployment

Set the real values plus `SMS_GATEWAY_ENABLED=true` in the server `/home/.../.env`,
rebuild the API and restart `gstflow-api`. Live phone delivery is confirmed by the
operator; automated verification covers boot/health and unit behaviour.
