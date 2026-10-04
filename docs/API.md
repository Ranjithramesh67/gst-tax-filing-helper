# GSTFlow API reference (`/v1`)

REST reference for the GSTFlow backend (`apps/api`). Derived from the NestJS controllers and the
shared `@gstflow/types` / `@gstflow/validation` packages.

- Base URL: `http://localhost:4000/v1`
- All request and response bodies are JSON unless noted (`POST /documents` is `multipart/form-data`;
  `GET /documents/:id/download` returns the raw file).
- Authenticated requests send `Authorization: Bearer <accessToken>`.
- Dates are ISO 8601 strings.
- Global prefix is `v1` and a global `HttpExceptionFilter` formats errors.

## Auth model

Roles: `SUPER_ADMIN`, `FIRM_ADMIN`, `FILER`, `CLIENT`. Staff roles are
`SUPER_ADMIN` + `FIRM_ADMIN` + `FILER`. Every endpoint is guarded by a global `JwtAuthGuard`
unless marked **Public**; a `RolesGuard` enforces the roles listed per endpoint.

<details>
<summary>Error and pagination shapes</summary>

Error:

```json
{ "statusCode": 400, "message": "Invalid or expired token", "requestId": null, "path": "/v1/..." }
```

Paginated lists:

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 25, "totalPages": 1 }
```

</details>

## Health

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/health` | Public | - | `{ status, uptime, db, timestamp }` |

## Auth

| Method | Path | Auth | Key request fields | Response |
|---|---|---|---|---|
| POST | `/auth/login` | Public | `email`, `password` | `AuthResponse` = `{ accessToken, refreshToken, expiresIn, user }` |
| POST | `/auth/otp/request` | Public | `phone`, `purpose` (`CLIENT_ONBOARDING`/`DEVICE_PAIRING`/`LOGIN`), `clientId?` | `{ requestId, expiresIn, devCode? }` (`devCode` only when `OTP_DEV_ECHO=true`) |
| POST | `/auth/otp/verify` | Public | `phone`, `code` (4-8 digits), `purpose`, `device?` (`androidId`, `platform`, `model?`, `osVersion?`, `appVersion?`, `pushToken?`) | `{ accessToken, refreshToken, expiresIn, client, consent, device? }` |
| POST | `/auth/refresh` | Public | `refreshToken` | `{ accessToken, refreshToken, expiresIn }` |
| POST | `/auth/logout` | Any bearer | `refreshToken` | `{ success: true }` |
| GET | `/auth/me` | Any bearer | - | `AuthUser`-like `{ id, role, firmId, clientId, email?, name? }` |

Notes: `otp/verify` looks up an active client by phone, upserts the device when supplied, writes a
versioned `ConsentRecord` (`otpVerified: true`), sets `client.consentGranted`, and issues client
tokens. OTPs expire after `OTP_TTL_SECONDS` and allow at most 5 attempts.

`otp/request` always stores the OTP. When `SMS_GATEWAY_ENABLED=true` it also delivers the OTP via
the configured ping4sms DLT template (`SMS_GATEWAY_TEMPLATE_ID`, default `1207170351303889084`);
delivery is best-effort and never blocks the request. With the flag off (local dev) the code is
only logged, and echoed in the response when `OTP_DEV_ECHO=true`.

## Clients

| Method | Path | Roles | Key request fields | Response |
|---|---|---|---|---|
| GET | `/clients` | staff | query: `page`, `pageSize` (<=200), `search`, `status` (`ACTIVE`/`INACTIVE`/`ARCHIVED`), `firmId` (super admin) | `Paginated<Client>` |
| POST | `/clients` | `SUPER_ADMIN`, `FIRM_ADMIN` | `name`, `phone`, `gstin?`, `pan?`, `email?`, `address?`, `stateCode?` (2), `firmId?` (super admin only) | `Client` |
| GET | `/clients/:id` | staff | - | `Client` (includes `_count` of sms/devices/documents) |
| PATCH | `/clients/:id` | `SUPER_ADMIN`, `FIRM_ADMIN` | any of the create fields, plus `status?` | `Client` |
| DELETE | `/clients/:id` | `SUPER_ADMIN`, `FIRM_ADMIN` | - | `{ success: true }` (archives the client) |
| GET | `/clients/:id/consents` | staff | - | `ConsentRecord[]` |
| POST | `/clients/:id/consents/revoke` | `FIRM_ADMIN`, `FILER` | - | `{ success: true }` (revokes consents, sets `consentGranted=false`, revokes devices) |

## Devices

| Method | Path | Roles | Key request fields | Response |
|---|---|---|---|---|
| GET | `/devices` | staff | query: `page?`, `pageSize?`, `clientId?`, `revoked?` | `Device[]` |
| GET | `/devices/:id` | staff | - | `Device` |
| POST | `/devices/register` | `CLIENT`, staff | `androidId`, `platform` (`ANDROID`/`IOS`), `model?`, `osVersion?`, `appVersion?`, `pushToken?`, `clientId?` (required for staff) | `Device` |
| POST | `/devices/:id/revoke` | `CLIENT`, staff | - | `Device` (revoked; active consents cleared, `consentGranted=false`) |
| POST | `/devices/:id/heartbeat` | `CLIENT` | - | `{ success: true }` (updates `lastSeenAt`) |

## SMS

| Method | Path | Roles | Key request fields | Response |
|---|---|---|---|---|
| POST | `/sms/ingest` | `CLIENT` | `items[]` of `{ sender, body, receivedAt (ISO), deviceId?, hash }` (1-200 items) | `{ accepted, duplicates, rejected, ids }` |
| GET | `/sms` | staff | query: `clientId?`, `category?`, `status?`, `from?`, `to?`, `search?` (sender), `page?`, `pageSize?` | `Paginated<SmsMessage>` |
| GET | `/sms/:id` | staff | - | `SmsMessage` (with `parsed` and `documents`) |
| POST | `/sms/:id/classify` | staff | `category`, `status?` | `SmsMessage` |

Notes: ingest requires an active client session and verified consent; each item is encrypted at
rest, auto-classified and parsed into `ParsedGstData`. Duplicate `(clientId, hash)` rows are
reported as `duplicates`. Bodies are decrypted on read for staff.

Parsed fields include the invoice-shaped values (`gstin`, `invoiceNo`, `amount`, `taxableValue`,
`taxAmount`, `hsn`, `dueDate`) plus compliance detail (`returnType`, `period` as `YYYY-MM`, `arn`,
`lateFee`, `filed`). When a message reports a filed return (ARN + type + period), the matching open
return and any linked filings are transitioned to `FILED` with an `SMS`-sourced history event.

## Documents

All document endpoints require staff roles. Upload is `multipart/form-data`.

| Method | Path | Key request fields | Response |
|---|---|---|---|
| POST | `/documents` | form field `file` (pdf/jpeg/png/webp, <= `MAX_UPLOAD_MB`), plus `clientId`, `type?` (`BILL`/`TAX_FILED_COPY`/`INVOICE_COPY`/`GST_CERTIFICATE`/`OTHER`), `smsMessageId?` | `Document` |
| GET | `/documents` | query: `page?`, `pageSize?`, `clientId?`, `type?` | `Paginated<Document>` |
| GET | `/documents/:id` | - | `Document` |
| GET | `/documents/:id/download` | - | raw file stream (`Content-Disposition: attachment`) |

## Invoices

Staff roles only.

| Method | Path | Key request fields | Response |
|---|---|---|---|
| GET | `/invoices` | query: `clientId?`, `page?`, `pageSize?` | `Paginated<Invoice>` |
| POST | `/invoices` | `clientId`, `smsMessageId?`, `invoiceNo?`, `invoiceDate?`, `counterpartyGstin?`, `taxableValue?`, `taxAmount?`, `totalAmount?` | `Invoice` |

## Returns

Staff roles only.

| Method | Path | Key request fields | Response |
|---|---|---|---|
| GET | `/returns` | query: `clientId?`, `status?` (`PENDING`/`IN_REVIEW`/`FILED`/`REJECTED`), `type?` (`GSTR1`/`GSTR3B`/`GSTR9`/`OTHER`), `page?`, `pageSize?` | `Paginated<GstReturn>` |
| POST | `/returns` | `clientId`, `type`, `period` (`YYYY-MM`), `dueDate?`, `notes?`, `status?` | `GstReturn` |
| GET | `/returns/:id/history` | - | `FilingStatusEvent[]` (newest first; includes linked filing events) |

## Filings

Staff roles only.

| Method | Path | Key request fields | Response |
|---|---|---|---|
| GET | `/filings` | query: `clientId?`, `status?`, `type?`, `page?`, `pageSize?` | `Paginated<Filing>` |
| POST | `/filings` | `clientId`, `returnId?`, `type`, `period` (`YYYY-MM`), `referenceNo?`, `notes?`, `status?` | `Filing` |
| PATCH | `/filings/:id/status` | `status`, `referenceNo?`, `notes?` | `Filing` |
| GET | `/filings/:id/history` | - | `FilingStatusEvent[]` (newest first) |

Notes: setting a filing to `FILED` records `filedAt`/`filedById`, and when the filing is linked to
a return (`returnId`) the parent `GstReturn` is marked `FILED` too. Every status transition is
appended to `FilingStatusEvent` (`source`: `MANUAL`/`SMS`/`SYSTEM`, optional actor, note and
`smsMessageId`), visible through the history endpoint and the Filings page History panel.

## Firm settings

Firm-scoped profile and branding. The target firm is always the authenticated
user's firm (`actor.firmId`); `slug` and `status` cannot be changed here.

| Method | Path | Auth | Key request fields | Response |
|---|---|---|---|---|
| GET | `/firm/profile` | permission `firm:read` | - | `Firm` |
| PATCH | `/firm/profile` | permission `firm:manage` | `name?`, `gstin?`, `email?`, `phone?`, `logoUrl?`, `brandColor?`, `supportEmail?`, `supportPhone?`, `address?`, `defaultFilingFee?` (nullable fields accept `null` to clear) | `Firm` |

Notes: a super admin without a firm receives `400`; every update writes a
`firm.profile.update` audit entry.

## Admin

| Method | Path | Roles | Key request fields | Response |
|---|---|---|---|---|
| GET | `/admin/firms` | `SUPER_ADMIN` | query: `page?`, `pageSize?`, `search?`, `status?` | `Paginated<Firm>` (with `_count`) |
| POST | `/admin/firms` | `SUPER_ADMIN` | `name`, `slug?` (auto-generated + de-duplicated), `gstin?`, `email?`, `phone?` | `Firm` |
| GET | `/admin/firms/:id` | `SUPER_ADMIN` | - | `Firm` |
| PATCH | `/admin/firms/:id` | `SUPER_ADMIN` | `name?`, `gstin?`, `email?`, `phone?`, `status?` | `Firm` |
| GET | `/admin/users` | `SUPER_ADMIN` | query: `page?`, `pageSize?`, `search?`, `role?`, `firmId?` | `Paginated<User>` |
| POST | `/admin/users` | `SUPER_ADMIN` | `name`, `email`, `password`, `role`, `phone?`, `firmId?` | `User` |
| PATCH | `/admin/users/:id` | `SUPER_ADMIN` | `name?`, `phone?`, `role?`, `isActive?` | `User` |
| GET | `/admin/releases` | `SUPER_ADMIN` | query: `page?`, `pageSize?`, `platform?`, `channel?` | `Paginated<AppRelease>` |
| POST | `/admin/releases` | `SUPER_ADMIN` | `platform`, `version`, `versionCode`, `channel`, `url`, `checksum?`, `changelog?`, `mandatory?` | `AppRelease` |
| GET | `/admin/audit` | `SUPER_ADMIN`, `FIRM_ADMIN`, `FILER` | query: `page?`, `pageSize?`, `firmId?` (super admin), `action?`, `entity?`, `from?`, `to?` | `Paginated<AuditLog>` |

## Notifications

In-app feed and deadline reminders. Scoped to the actor: staff see firm-wide rows
plus rows addressed to them; a party (`CLIENT`) sees only rows addressed to them.

| Method | Path | Auth | Key request fields | Response |
|---|---|---|---|---|
| GET | `/notifications` | any bearer | query: `unreadOnly?`, `page?`, `pageSize?` | `Paginated<AppNotification>` |
| GET | `/notifications/unread-count` | any bearer | - | `{ count }` |
| POST | `/notifications/:id/read` | any bearer | - | `AppNotification` (404 if out of scope) |
| POST | `/notifications/read-all` | any bearer | - | `{ updated }` |
| POST | `/reminders/run` | `SUPER_ADMIN` | - | `{ created }` |

Notes: the reminder generator scans open returns with a due date and creates one
notification per bucket (`RETURN_DUE_7D`, `RETURN_DUE_3D`, `RETURN_DUE_1D`,
`RETURN_OVERDUE`), deduplicated by `(firmId, dedupeKey)`. It runs on boot and every
`REMINDER_INTERVAL_MS` (default 6h); set `REMINDERS_ENABLED=false` to disable, and
`NOTIFY_WEBHOOK_URL` to also POST new notifications to a webhook.

## SMS gateway (super admin)

Outbound OTP SMS is configured at runtime from the super admin panel. The active
provider is used for OTP delivery; if none is configured the env-based
`SMS_GATEWAY_*` gateway is used as a fallback. Credentials are encrypted at rest
and never returned (only their key names are exposed).

| Method | Path | Auth | Key request fields | Response |
|---|---|---|---|---|
| GET | `/admin/sms-providers` | `SUPER_ADMIN` | - | `SmsProviderConfig[]` |
| GET | `/admin/sms-providers/:id` | `SUPER_ADMIN` | - | `SmsProviderConfig` |
| POST | `/admin/sms-providers` | `SUPER_ADMIN` | `name`, `url`, `sender`, `messageTemplate`, `appName`, `credentials?`, `provider?`, `method?`, `route?`, `templateId?`, `header?`, `variables?`, `timeoutMs?`, `isActive?` | `SmsProviderConfig` |
| PATCH | `/admin/sms-providers/:id` | `SUPER_ADMIN` | any create field (all optional; omit `credentials` to keep existing) | `SmsProviderConfig` |
| POST | `/admin/sms-providers/:id/activate` | `SUPER_ADMIN` | - | `SmsProviderConfig` |
| POST | `/admin/sms-providers/test` | `SUPER_ADMIN` | `numbers[]`, `code?`, `providerId?` and/or `config?` | `SmsTestReport` |

Message tokens: `{{app name}}` / `{{app_name}}` resolve to `appName`, `{{variable}}`
/ `{{otp}}` / `{{code}}` resolve to the OTP, and any other `{{token}}` resolves from
the `variables` map. `SmsTestReport` returns per-number `{ to, ok, status?, error?, preview? }`
without echoing credentials.

## Enums

- `Role`: `SUPER_ADMIN`, `FIRM_ADMIN`, `FILER`, `CLIENT`
- `FirmStatus`: `ACTIVE`, `SUSPENDED`, `PENDING`
- `ClientStatus`: `ACTIVE`, `INACTIVE`, `ARCHIVED`
- `SmsCategory`: `GST_INVOICE`, `GST_RETURN`, `EWAY_BILL`, `TAX_PAYMENT`, `GST_NOTICE`, `UNCLASSIFIED`, `OTHER`
- `SmsStatus`: `RECEIVED`, `REVIEWED`, `FILED`, `IGNORED`, `FAILED`
- `DocumentType`: `BILL`, `TAX_FILED_COPY`, `INVOICE_COPY`, `GST_CERTIFICATE`, `OTHER`
- `ReturnType`: `GSTR1`, `GSTR3B`, `GSTR9`, `OTHER`
- `FilingStatus`: `PENDING`, `IN_REVIEW`, `FILED`, `REJECTED`
- `OtpPurpose`: `CLIENT_ONBOARDING`, `DEVICE_PAIRING`, `LOGIN`
- `DevicePlatform`: `ANDROID`, `IOS`
- `ReleaseChannel`: `STABLE`, `BETA`
- `SmsProviderKind`: `PING4SMS`
