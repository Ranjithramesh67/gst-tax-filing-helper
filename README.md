# GSTFlow

GSTFlow is a GST filing automation platform for CA and accounting firms. Clients receive
GST-relevant SMS (invoices, e-way bills, GST notices, tax payments); GSTFlow lets a client
grant consent and pair an Android device that forwards only GST/tax-related SMS to the
backend. The firm's staff then review each message and track the return, invoice and
filing work in a web app.

The platform is a four-surface product built as an npm workspaces + Turborepo monorepo.

## The four surfaces

| Surface | Directory | Users | Stack | Purpose |
|---|---|---|---|---|
| Backend API | `apps/api` | all | NestJS + Prisma + PostgreSQL | Single source of truth; every other surface talks to `/v1` over REST |
| Firm webapp | `apps/web` | `FIRM_ADMIN`, `FILER` | Next.js App Router + Tailwind | Manage clients/devices, review the SMS inbox, upload documents, create invoices/returns, track filings |
| Admin panel | `apps/admin` | `SUPER_ADMIN` | Next.js App Router + Tailwind | Manage firms and users, publish app releases, read the platform audit log |
| Client mobile app | `apps/mobile` | `CLIENT` | React Native (bare, Android) | Versioned consent + OTP onboarding, background GST SMS capture, encrypted offline queue, ingest to the API |

How they relate:

- The **API** owns auth, tenant scoping and all persistence. It exposes a single `/v1` REST
  surface authenticated with JWT bearer access tokens (plus refresh tokens).
- The **firm webapp** and **admin panel** are browser clients of the same API; they differ only
  by which endpoints and roles they are allowed to use.
- The **client mobile app** authenticates with the OTP/verify flow, registers a device, records
  consent, and posts batches of GST-only SMS to `POST /v1/sms/ingest`.
- Every tenant-owned row carries `firmId`. A NestJS `RolesGuard` plus per-service firm scoping
  reject cross-firm access, so a firm's staff can only see its own clients and messages.

> Note: this checkout contains `apps/api`, `apps/web` and `apps/admin`. The `apps/mobile`
> directory referenced by the design spec and the root `mobile:start` script is **not present in
> this checkout**; the mobile surface is described here for completeness and must be added
> before the mobile steps below can run.

## Architecture summary

- **Monorepo**: npm workspaces (`apps/*`, `packages/*`) orchestrated by Turborepo.
- **API**: NestJS 10 (controllers + services), Prisma 5 ORM, PostgreSQL 15. Global
  `JwtAuthGuard` + `RolesGuard`. Zod request validation through a shared pipe. A global
  exception filter returns `{ statusCode, message, requestId, path }`.
- **Shared packages**: `@gstflow/types` (entities/enums/API DTO shapes), `@gstflow/validation`
  (Zod schemas), `@gstflow/api-client` (typed fetch client).
- **Web**: Next.js 14 App Router, React Query, Tailwind.
- **Admin**: Next.js 14 App Router, React Query, Tailwind.
- **SMS at rest**: bodies are encrypted with AES-256-GCM using `SMS_ENC_KEY`.
- **Data flow**:

```text
Android SMS broadcast
  -> foreground service listener
  -> consent gate (active ConsentRecord + device not revoked)
  -> GST keyword / GSTIN filter
  -> encrypted offline queue (retry/backoff)
  -> POST /v1/sms/ingest (client JWT)
Backend: persist SmsMessage (encrypted) -> parse -> ParsedGstData -> await firm review
Filer webapp: SMS Inbox -> review -> upload Documents -> create Invoice / Return -> Filing tracked
Admin: firms / users / app releases / audit log
```

## Prerequisites

- **Node.js >= 20** and npm (npm workspaces; the repo pins `engines.node >= 20`).
- **PostgreSQL 15** (via Docker or a local install).
- **Docker** (optional but recommended) for `docker compose`.
- **Android SDK** for the mobile build: JDK 17, Android SDK platform + build-tools, `ANDROID_HOME`
  exported, and either an emulator (AVD) or a USB-debuggable device. React Native ships via
  `apps/mobile` (see the note above).

## Local setup

Run these steps from the repository root.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Then edit `.env` if needed. The defaults already point at the local Postgres created below
(`postgresql://gstflow:gstflow@localhost:5432/gstflow?schema=public`). Keep
`OTP_DEV_ECHO=true` in development so OTP requests return `devCode`.

### 3. Start PostgreSQL

Option A - Docker (recommended):

```bash
docker compose up -d postgres
```

The compose file defines the `gstflow` / `gstflow` / `gstflow` credentials on port `5432` with a
named volume and a `pg_isready` healthcheck.

Option B - local PostgreSQL 15 (Debian/Ubuntu):

```bash
sudo apt-get update
sudo apt-get install -y postgresql-15
sudo systemctl start postgresql
sudo -u postgres psql -c "CREATE ROLE gstflow LOGIN PASSWORD 'gstflow';"
sudo -u postgres psql -c "CREATE DATABASE gstflow OWNER gstflow;"
```

### 4. Run migrations and seed

```bash
# Make the helper scripts executable once
chmod +x scripts/dev.sh scripts/seed.sh

# Apply migrations, generate the Prisma client, then seed demo data
./scripts/seed.sh
```

Equivalent manual commands:

```bash
npm run db:deploy --workspace @gstflow/api
npm run db:generate --workspace @gstflow/api
npm run db:seed --workspace @gstflow/api
```

### 5. Start the API (port 4000)

```bash
npm run api:dev
```

The API listens at `http://localhost:4000/v1`. Check `GET http://localhost:4000/v1/health`.

### 6. Start the firm webapp (port 3000)

```bash
npm run web:dev
```

Open `http://localhost:3000` and sign in as a `FIRM_ADMIN` or `FILER`.

### 7. Start the admin panel (port 3001)

```bash
npm run admin:dev
```

Open `http://localhost:3001` and sign in as `SUPER_ADMIN`.

### 8. Start the mobile app

```bash
npm run mobile:start
```

The app talks to the API at `MOBILE_API_URL` (default `http://10.0.2.2:4000/v1`, which maps the
Android emulator to the host machine). Build/run the Android target from `apps/mobile`.

### All-in-one developer script

`scripts/dev.sh` starts Postgres via `docker compose up -d postgres` when Docker exists (otherwise
it prints a reminder), ensures `.env` exists, then runs the API, web and admin dev servers using
npm workspace scripts. It backgrounds the servers and cleans them up on exit.

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

## Seeded demo accounts

The seed creates firm **Sharma & Associates** (`sharma-associates`) with two clients
(**Acme Traders Pvt Ltd** - `+919876543210`, and **Beta Enterprises** - `+919812345678`) and one
sample GST SMS.

| Role | Email | Password | Surface |
|---|---|---|---|
| `SUPER_ADMIN` | `superadmin@gstflow.local` | `Admin@12345` | Admin panel (3001) |
| `FIRM_ADMIN` | `admin@sharma.local` | `Firm@12345` | Firm webapp (3000) |
| `FILER` | `filer@sharma.local` | `Filer@12345` | Firm webapp (3000) |

### Client OTP demo flow

Clients do not use passwords; they onboard with the client's registered phone number.

1. Request an OTP for a seeded client phone:

```bash
curl -s -X POST http://localhost:4000/v1/auth/otp/request \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+919876543210","purpose":"CLIENT_ONBOARDING"}'
```

With `OTP_DEV_ECHO=true` the response includes `{ "requestId", "expiresIn", "devCode" }`. Use
`devCode` as the OTP.

2. Verify the OTP (optionally registering the device; this also writes the `ConsentRecord` and
   issues client tokens):

```bash
curl -s -X POST http://localhost:4000/v1/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+919876543210","code":"<devCode>","purpose":"CLIENT_ONBOARDING","device":{"androidId":"demo-device-001","platform":"ANDROID"}}'
```

The response contains `accessToken`, `refreshToken`, `expiresIn`, `client`, `consent` and
`device`. Use the bearer token to call `POST /v1/sms/ingest`.

## Tests and verification

```bash
# Lint every workspace (also acts as typecheck via tsc --noEmit)
npm run lint

# Typecheck every workspace
npm run typecheck

# Run unit tests across all workspaces
npm test

# Build all workspaces (API dist, Next.js production builds)
npm run build
```

`npm test` uses Jest for the API and package tests and passes with no tests where none are
defined. See `docs/API.md` for the full REST reference.

## Security and consent

- **Consent before collection**: a versioned consent record is written before any ingestion. The
  Android app gates the SMS listener on an active `ConsentRecord` **and** a non-revoked device.
- **OTP before sync**: the client's phone number is verified by OTP before the first sync and
  before a device is paired.
- **GST-only filtering**: only SMS matching GST keywords/GSTIN patterns are forwarded. Raw bodies
  are stored encrypted at rest with AES-256-GCM keyed by `SMS_ENC_KEY` (set a 32-byte hex value
  in production).
- **Audit trail**: logins, OTP events, ingest, classify, document upload, client changes, filings
  and admin actions are written to `AuditLog` and exposed at `GET /v1/admin/audit`.
- **Revocation**: revoking consent in the app, revoking a device, or `POST
  /v1/clients/:id/consents/revoke` stops ingestion immediately - the server rejects ingest from
  revoked devices. `POST /v1/devices/:id/revoke` also clears active consents.
- **Tenant isolation**: `firmId` scoping plus the roles guard prevents cross-firm access.
- **Never enable `OTP_DEV_ECHO` in production**.

## Not included in the MVP

- **No live GSTN portal filing.** Filings and returns are modelled and tracked records only; there
  is no integration with the GSTN/government portal in this version.
- No e-sign or payments.
- No iOS background SMS capture (the platform blocks it); iOS is at most a reduced reader.
- No push notifications beyond storing an FCM `pushToken` field on the device.
