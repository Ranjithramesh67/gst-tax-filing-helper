# GSTFlow — Design Spec

Date: 2026-09-30
Status: Approved

## 1. Problem

CA / accounting firms file GST returns for many clients. Clients receive GST-relevant
SMS (OTP-free transactional messages about invoices, e-way bills, GST notices, tax
payments). Today the filer must phone/chat each client to collect this. GSTFlow lets a
client install a lightweight Android app that, **with explicit consent and OTP
verification**, reads only GST/tax-related SMS in the background and forwards them to
the backend. The firm's filer then reviews each message in a web app and files the
return / invoice.

## 2. Surfaces

| Surface | Dir | Stack |
|---|---|---|
| Backend API | `apps/api` | Node + TypeScript + NestJS + Prisma + PostgreSQL |
| Admin panel | `apps/admin` | Next.js App Router + Tailwind + shadcn/ui |
| Firm webapp | `apps/web` | Next.js App Router + Tailwind + shadcn/ui |
| Client mobile app | `apps/mobile` | React Native (bare, Android) + native SMS foreground service |
| Shared libs | `packages/*` | `types`, `validation` (Zod), `api-client`, `config`, `ui` |

Monorepo: npm workspaces + Turborepo. Postgres provisioned locally for dev.

## 3. Roles

- `SUPER_ADMIN` — platform owner. Uses admin panel. Distributes the mobile app.
- `FIRM_ADMIN` — CA firm owner. Webapp. Manages filers and clients.
- `FILER` — CA firm staff. Webapp. Reviews SMS, files returns.
- `CLIENT` — taxpayer. Mobile app only.

Tenant isolation: every tenant-owned row carries `firmId`; a Prisma middleware + NestJS
guard rejects cross-firm access.

## 4. Data Model (Prisma / PostgreSQL)

- `Firm` (tenant), `User` (role, firmId nullable for SUPER_ADMIN)
- `Client` (firmId, GSTIN, PAN, name, contact, status)
- `Device` (clientId, androidId, model, appVersion, pushToken, lastSeenAt, revoked)
- `ConsentRecord` (clientId, deviceId, version, acceptedAt, ip, otpVerified, revokedAt)
- `OtpVerification` (phone, codeHash, purpose, expiresAt, consumedAt, attempts)
- `SmsMessage` (clientId, deviceId, sender, bodyEncrypted, receivedAt, category,
  status, hash for de-dup)
- `ParsedGstData` (smsMessageId 1-1, gstin, invoiceNo, amount, taxableValue, taxAmount,
  hsn, dueDate, rawJson, confidence)
- `Document` (clientId, smsMessageId?, type, storageKey, mime, size, uploadedBy)
- `Invoice`, `GstReturn`, `Filing` (clientId, period, type, status, filedBy, filedAt)
- `AppRelease` (platform, version, url, changelog, channel, mandatory)
- `AuditLog` (actorId, firmId, action, entity, entityId, meta, ip, createdAt)

## 5. Data Flow

```
Android SMS broadcast
  -> foreground service listener
  -> consent gate (active ConsentRecord + device not revoked)
  -> GST filter (GSTIN regex, HSN, keywords: GST, tax, invoice, e-way bill, ...)
  -> encrypted offline queue (retry/backoff)
  -> POST /v1/sms/ingest  (device token auth)
Backend: persist SmsMessage -> parse -> ParsedGstData -> enqueue for firm review
Filer webapp: SMS Inbox -> review -> upload Documents -> create Invoice/Return ->
  Filing status tracked. Admin: firms/users/releases/audit.
```

## 6. Consent & Compliance

- Versioned consent text shown before enabling collection; user must press accept.
- OTP verification of the client phone number before first sync.
- Only GST/tax keyword-matched SMS are forwarded; raw bodies encrypted at rest (AES-GCM,
  key from `SMS_ENC_KEY`).
- `AuditLog` records every ingest, read, classify, upload, and filing action.
- Revoking consent (app) or revoking the device (webapp/admin) stops ingestion
  immediately. Server rejects ingest from revoked devices.
- No actual GSTN portal API integration in MVP: filings are modelled/tracked records,
  not live portal submissions.

## 7. API Surface (`/v1`)

- Auth: `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/login`,
  `POST /auth/refresh`, `GET /auth/me`
- Admin: `GET/POST/PATCH /admin/firms`, `GET/POST/PATCH /admin/users`,
  `GET/POST /admin/releases`, `GET /admin/audit`
- Clients: `GET/POST /clients`, `GET/PATCH/DELETE /clients/:id`,
  `GET/POST /clients/:id/consents`
- Devices: `GET /devices`, `POST /devices/register`, `POST /devices/:id/revoke`
- SMS: `POST /sms/ingest`, `GET /sms`, `GET /sms/:id`,
  `POST /sms/:id/classify`
- Documents: `POST /documents` (multipart), `GET /documents`, `GET /documents/:id`
- Collection: `GET/POST /invoices`, `GET/POST /returns`, `GET/POST /filings`,
  `POST /filings/:id/status`
- Health: `GET /health`

## 8. Testing

- API: Jest unit + Supertest e2e on a test schema.
- Web/Admin: Vitest + Testing Library.
- Mobile: Jest for the SMS filter, consent gate, and sync queue logic.
- `turbo lint test build` is the CI gate.

## 9. Out of Scope (MVP)

- Live GSTN/portal filing, e-sign, payments.
- iOS background SMS (platform blocks it); iOS build is a reduced reader.
- Push notifications beyond an FCM token field.
