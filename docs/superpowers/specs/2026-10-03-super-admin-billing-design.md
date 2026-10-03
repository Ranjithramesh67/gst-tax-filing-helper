# GSTFlow — Super Admin Control Plane, White-Label Paths & Firm Billing

Date: 2026-10-03
Status: Approved (design); pending implementation

## 1. Context

GSTFlow is a monorepo product sold by a software company (the platform owner) to
GST firms. Each firm files GST returns for its own customers ("GST owners" /
`Client` records) and charges roughly INR 500-1000 per filing. Firms currently
have no way to track what each customer owes or has paid.

The platform owner needs:

1. A rebuilt **super admin control plane** to provision and brand firms.
2. **White-label, path-based firm access**: each firm logs in at `/<slug>` with
   its own logo/name.
3. **Firm billing/receivables**: record a fee per filing, track multiple
   payments per filing (with proof links), and see outstanding balances.
4. Later (Phase 3, not built now): a payment gateway that generates payment
   links; the data model must accommodate it.

### Current state

- `apps/api` — NestJS + Prisma (PostgreSQL). Modules: admin, auth, clients,
  devices, documents, filings, sms, storage, health.
- `apps/web` — firm-facing Next.js panel (App Router), routes at root
  (`/login`, `/clients`, `/sms`, `/documents`, `/filings`). Client-side auth via
  `localStorage` tokens; no middleware.
- `apps/admin` — platform operator Next.js panel (firms, users, releases, audit),
  SUPER_ADMIN only.
- `packages/types`, `packages/validation`, `packages/api-client` — shared
  contracts. `Firm.slug` already exists (unique, auto-generated from name).

## 2. Decisions (from brainstorming)

| Question | Decision |
| --- | --- |
| Who is the super admin panel for? | The platform owner (software company) |
| Admin panel route | Rebuild `apps/admin` as a new control plane |
| Firm access mechanism | Path-based `/<slug>` on one `apps/web` deploy |
| Fee recording | A fee attached to each `Filing` |
| Payment detail | Multiple payments per filing, each with status, date/time, proof links |
| Branding control | Super admin controls all branding (no firm self-service) |
| Branding scope | Logo, name, brand color, contact details |
| Payment links | Proof/receipt links per payment |
| Gateway | Deferred to Phase 3 |

## 3. Scope / Phasing

Delivered through one spec; implemented in phases.

- **Phase 1 — Control plane + white-label paths**
  - Additive schema: `Firm` branding/fee fields.
  - Public branding endpoint + reserved-slug rules.
  - Firm-scoped login (slug + email + password), branded `/<slug>` login and
    dashboard header in `apps/web`.
  - Rebuilt `apps/admin`: overview, firms (create/edit + branding + create firm
    admin), users, releases, audit.
- **Phase 2 — Firm billing/receivables**
  - Additive schema: `Filing.feeAmount`, `Payment`, `PaymentLink`, enums.
  - API payments module (create/list/update/delete, derived balances).
  - Firm UI: fee entry on filing, payments drawer/panel, receivables page,
    client dues.
  - Admin billing oversight (aggregate + drill-down, read-only).
- **Phase 3 — Payment gateway (not built now)**
  - Gateway-generated customer payment links stored in `PaymentLink` with a
    provider field; webhook updates `Payment.status`. Design must not preclude
    this.

Out of scope now: GST-owner (client) self-service portal; platform subscription
billing (what firms pay the platform); SMS/parser changes.

## 4. Architecture

One API, one firm web deploy, one admin deploy. Tenancy continues to be enforced
by `firmId` on the API via the existing JWT actor.

### 4.1 Path-based tenancy (`apps/web`)

- Routes move under `app/[firm]/...`:
  - `app/[firm]/login/page.tsx`
  - `app/[firm]/(dashboard)/...` (clients, sms, documents, filings, receivables,
    client detail)
- Reserved slugs (case-insensitive) that cannot be assigned to a firm:
  `login`, `logout`, `api`, `admin`, `_next`, `public`, `static`, `assets`,
  `favicon.ico`, `robots.txt`, `sitemap.xml`, `health`.
  Enforced server-side on create/update; a reserved slug returns `400`.
- Root `/` redirects to `/login` (platform-agnostic) or a small firm chooser.
  `/login` remains a generic fallback that asks for the firm code.
- The `[firm]` layout resolves branding via the public endpoint and provides it
  through a `FirmBrandingProvider` (React context). Unknown/suspended slug
  renders a "firm not found / suspended" state.
- `onUnauthorized` redirects to `/<slug>/login` derived from the current path.

### 4.2 Branding resolution

- New public endpoint `GET /v1/public/firms/:slug` (no auth) returns
  `{ name, slug, logoUrl, brandColor, supportEmail, supportPhone, address, status }`.
- Only `ACTIVE`/`PENDING`(non-suspended) firms render a login; `SUSPENDED`
  returns a suspended state.
- Only super admin can edit branding.

### 4.3 Firm authentication

- `LoginBody` gains an optional `firmSlug`.
- On login, if `firmSlug` is supplied, the API verifies the user's `firm.slug`
  matches (case-insensitive) and rejects mismatches with 401. SUPER_ADMIN users
  are not bound to a slug.
- The firm login page lives at `/<slug>/login` and submits `{ firmSlug, email,
  password }`.
- Existing token/actor flow and guards are unchanged.

## 5. Data model changes (additive only)

Prisma schema additions (no renames/removals; existing `Firm.slug` reused):

```prisma
enum PaymentStatus { PENDING COMPLETED FAILED REFUNDED }
enum PaymentMethod { CASH UPI BANK_TRANSFER CHEQUE CARD OTHER }

model Firm {
  // ...existing...
  logoUrl           String?
  brandColor        String?   // hex, e.g. "#0F766E"
  supportEmail      String?
  supportPhone      String?
  address           String?
  defaultFilingFee  Float?    // INR, pre-fills new filings
  payments          Payment[]
}

model Filing {
  // ...existing...
  feeAmount   Float?   // amount charged to the client for this filing (INR)
  payments    Payment[]
}

model Payment {
  id          String         @id @default(cuid())
  firmId      String
  clientId    String
  filingId    String
  amount      Float
  status      PaymentStatus  @default(PENDING)
  method      PaymentMethod?
  paidAt      DateTime?
  reference   String?
  notes       String?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  firm   Firm           @relation(fields: [firmId], references: [id], onDelete: Cascade)
  client Client         @relation(fields: [clientId], references: [id], onDelete: Cascade)
  filing Filing         @relation(fields: [filingId], references: [id], onDelete: Cascade)
  links  PaymentLink[]

  @@index([firmId, status])
  @@index([filingId])
  @@index([clientId])
}

model PaymentLink {
  id        String   @id @default(cuid())
  paymentId String
  label     String
  url       String
  createdAt DateTime @default(now())

  payment Payment @relation(fields: [paymentId], references: [id], onDelete: Cascade)

  @@index([paymentId])
}
```

`Client` and `Firm` get the back-relation arrays (`payments`).

Derived filing state (NOT stored): given `feeAmount` F and payments with status
`COMPLETED` summing to P:
- `UNPAID` when P == 0
- `PARTIAL` when 0 < P < F
- `PAID` when P >= F
- `NONE` when `feeAmount` is null/unset

`Filing` (shared type) gains `feeAmount`, `paidAmount`, `balanceAmount`,
`paymentState` (computed server-side on read; `paidAmount`/`balanceAmount`/
`paymentState` are response-only fields).

## 6. Shared contracts

`packages/types` (additive):

- `enums.ts`: `PaymentStatus`, `PaymentMethod`.
- `entities.ts`: extend `Firm` (branding/fee + `_count.payments?`), `Filing`
  (`feeAmount`, `paidAmount`, `balanceAmount`, `paymentState`), add `Payment`,
  `PaymentLink`, `PaymentState`.
- `api.ts`: `FirmBranding` public shape; `LoginBody.firmSlug?`;
  `UpdateFirmBody` branding fields; `CreateFilingBody.feeAmount?`;
  `UpdateFilingBody.feeAmount?`; `CreatePaymentBody`, `UpdatePaymentBody`,
  `PaymentLinkBody`, `ListPaymentsQuery`, `ReceivablesSummary`,
  `PaginatedPayments`, `PlatformBillingSummary`.

`packages/validation`: new `payment.ts` schemas (`createPayment`,
`updatePayment`, `paymentLink`, `listPayments`); extend `admin.ts` firm
create/update with branding + fee; extend `filing.ts` with `feeAmount`; extend
`auth.ts` login with `firmSlug`.

`packages/api-client`: add `api.public.branding(slug)`, `api.filings.update`,
`api.payments.*`, `api.admin.firms.get/update` branding, `api.admin.billing.*`,
and `firmSlug` on login.

## 7. API surface

New/changed endpoints (all under `/v1`):

- `GET /public/firms/:slug` — public branding (no auth).
- `POST /auth/login` — accepts optional `firmSlug`.
- `PATCH /filings/:id` — accept `feeAmount` (FIRM_ADMIN/FILER, firm-scoped).
- `POST /filings/:id/payments` — create payment.
- `GET /filings/:id/payments` — list payments.
- `PATCH /payments/:id` — update status/method/date/notes.
- `DELETE /payments/:id` — remove a payment.
- `POST /payments/:id/links` — add proof link.
- `DELETE /payments/:id/links/:linkId` — remove link.
- `GET /payments` — tenant-scoped list (filters: clientId, status, from, to).
- `GET /payments/receivables` — firm summary grouped by client.
- `PATCH /admin/firms/:id` — branding + `defaultFilingFee`.
- `GET /admin/billing` — platform-wide summary per firm (billed/collected/
  outstanding).
- `GET /admin/firms/:id/billing` — per-firm read-only drill-down.

All firm/payment routes enforce `firmId === actor.firmId` (SUPER_ADMIN bypass);
payments are validated to belong to the actor's firm and the filing to the same
client/firm.

## 8. UI

### 8.1 Super admin (`apps/admin`, rebuilt)

- Branded login (platform logo).
- Overview: firms, users, total filings, billed/collected/outstanding platform
  totals.
- Firms: table + create/edit with sections — Identity (name, slug/path,
  GSTIN, email, phone), Branding (logo URL/upload, brand color, support email/
  phone, address), Billing (default filing fee), Status. "Create firm admin"
  action (name, email, password).
- Firm detail: read-only clients, filings, payments, and billing totals.
- Users, App releases, Audit: carried over.

### 8.2 Firm panel (`apps/web`)

- `/<slug>/login` branded (logo, name, color); generic `/login` asks for firm
  code.
- Dashboard header shows firm logo/name.
- Filings: creating/updating a filing accepts a fee (pre-filled from
  `defaultFilingFee`); row shows fee, paid, balance, payment state.
- Payments: a filing detail/panel lists payments (amount, status, method, date,
  notes) with add/edit/delete and proof links.
- Receivables: table of clients with billed/collected/outstanding, filter by
  month/period and status; drill-down to a client's filings and payments.
- Client detail: dues history.

`brandColor` applies to primary buttons/header accents; default to existing
brand when unset.

## 9. Error handling & edge cases

- Unknown slug → branded "firm not found"; suspended → "account suspended".
- Reserved/duplicate slug → 400 with a clear message.
- Login with wrong `firmSlug` → 401 (no cross-firm login).
- Payment amount <= 0, or overpay beyond balance → allowed but flagged; negative
  guarded by validation.
- Cross-firm access to a filing/payment → 404 (not 403, to avoid leaking ids).
- Deleting a filing cascades its payments; deleting a payment cascades its links.
- Logo: MVP accepts an HTTPS URL or an uploaded file via the existing storage
  module; validates `image/*` and a max size.

## 10. Testing

- Unit (API): fee/balance/payment-state derivation; reserved-slug validation;
  branding serialization; login slug binding; tenant scoping for payments.
- e2e (API): create firm with branding, public branding fetch, firm login
  bound to slug, create filing with fee, add payments, receivables totals,
  cross-firm 404.
- Typecheck: `apps/api`, `apps/web`, `apps/admin`, all packages.
- Build: `apps/admin` and `apps/web` production builds succeed.

## 11. Migration & rollout

- Prisma migration is additive; existing rows get null branding/fee.
- `apps/admin` rebuild replaces pages in place (same package).
- `apps/web` route restructure: keep `/login` as fallback; existing deep links
  to `/clients` etc. are replaced by `/<slug>/...`.
- No change to the mobile API contract.
