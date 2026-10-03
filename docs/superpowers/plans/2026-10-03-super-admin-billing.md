# Super Admin Control Plane, White-Label Paths & Firm Billing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the platform-owner admin, add per-firm branded `/<slug>` access, and let firms record fees per filing and track multiple payments/receivables.

**Architecture:** Additive Prisma migrations + shared contract extensions; new NestJS `payments` module and a public branding controller; `apps/web` restructured to `app/[firm]/...`; `apps/admin` rebuilt as a control plane. One API, one web deploy, one admin deploy. Tenancy stays enforced by `firmId` from the JWT actor.

**Tech Stack:** NestJS + Prisma/PostgreSQL, Next.js App Router (web + admin), TanStack Query, Zod, TypeScript, Jest (API unit/e2e), pnpm workspace.

## Global Constraints

- Do NOT rename or remove existing fields on Prisma models, `@gstflow/types`, or `@gstflow/validation`. Changes are **additive**.
- All money is INR; store as `Float`, render with `Intl.NumberFormat('en-IN', { currency: 'INR' })`.
- Firm-scoped endpoints must scope by `actor.firmId`; cross-firm access returns **404** (never 403), so ids don't leak. `SUPER_ADMIN` bypasses.
- Reserved firm slugs (case-insensitive), rejected on firm create/update: `login`, `logout`, `api`, `admin`, `_next`, `public`, `static`, `assets`, `favicon.ico`, `robots.txt`, `sitemap.xml`, `health`.
- Only `SUPER_ADMIN` may edit firm branding.
- Payment status derived per filing from `COMPLETED` payments: `NONE` / `UNPAID` / `PARTIAL` / `PAID` (server-computed, not stored).
- **Commits:** the repository owner requires that changes are **not committed unless explicitly requested**. Treat every "Commit" step as a checkpoint: stage files and leave them uncommitted unless the user asks.
- Run all package commands from `/workspace`. Package scripts: `pnpm --filter <pkg> typecheck`; API tests: `pnpm --filter @gstflow/api test`.

---

## Phase 1 — Control plane + white-label paths

### Task 1: Schema, types & validation for firm branding + fee

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Firm model, ~line 89)
- Modify: `packages/types/src/entities.ts` (Firm, ~line 14)
- Modify: `packages/types/src/api.ts` (CreateFirmBody/Lists, ~line 150)
- Modify: `packages/validation/src/admin.ts`
- Create: `apps/api/prisma/migrations/<timestamp>_firm_branding/migration.sql` (via prisma migrate dev)
- Test: `apps/api/src/admin/admin.service.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Firm` gains `logoUrl`, `brandColor`, `supportEmail`, `supportPhone`, `address`, `defaultFilingFee` (`number | null`). `FirmBranding` type `{ name, slug, logoUrl, brandColor, supportEmail, supportPhone, address, status }`.

- [ ] **Step 1: Add fields to the Prisma schema**

In `model Firm`, after `phone`:

```prisma
  logoUrl          String?
  brandColor       String?
  supportEmail     String?
  supportPhone     String?
  address          String?
  defaultFilingFee Float?
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @gstflow/api exec prisma migrate dev --name firm_branding`
Expected: migration created, client regenerated, no data loss.

- [ ] **Step 3: Extend the shared `Firm` entity**

In `packages/types/src/entities.ts`, add the six fields to `interface Firm` (all `string | null` except `defaultFilingFee: number | null`), and add:

```ts
export interface FirmBranding {
  name: string;
  slug: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  address?: string | null;
  status: FirmStatus;
}
```

- [ ] **Step 4: Extend api.ts bodies**

`CreateFirmBody` gains optional `logoUrl?`, `brandColor?`, `supportEmail?`, `supportPhone?`, `address?`, `defaultFilingFee?` (`number`). Add `UpdateFirmBody = Partial<CreateFirmBody> & { status?: Firm['status'] }` and `PaginatedPayments` placeholder later (Phase 2).

- [ ] **Step 5: Extend validation**

In `packages/validation/src/admin.ts`, add to the firm create schema and create/export an update schema:

```ts
const brandColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex color').optional();
const logoUrl = z.string().url().max(2048).optional();
const defaultFilingFee = z.number().nonnegative().max(1_000_000).optional();
export const updateFirmSchema = createFirmSchema.extend({
  status: z.nativeEnum(FirmStatus).optional(),
  logoUrl, brandColor, supportEmail: z.string().email().optional(), supportPhone: z.string().max(20).optional(), address: z.string().max(500).optional(), defaultFilingFee,
});
```

- [ ] **Step 6: Write a failing unit test**

Create `apps/api/src/admin/admin.service.spec.ts` asserting `createFirm` persists `defaultFilingFee` and `brandColor` and `serialiseFirm` returns them. Run: `pnpm --filter @gstflow/api test -- admin.service.spec.ts`
Expected: FAIL (fields not serialised yet).

- [ ] **Step 7: Update `serialiseFirm`**

Extend the input type + output in `apps/api/src/common/serializers.ts` with the new fields.

- [ ] **Step 8: Run test + typecheck**

Run: `pnpm --filter @gstflow/api test -- admin.service.spec.ts && pnpm --filter @gstflow/api typecheck && pnpm --filter @gstflow/types typecheck`
Expected: PASS.

- [ ] **Step 9: Checkpoint (stage only, no commit unless asked)**

```bash
git add apps/api/prisma packages/types packages/validation apps/api/src/common/serializers.ts apps/api/src/admin
```

---

### Task 2: Public branding endpoint + api-client

**Files:**
- Create: `apps/api/src/public/public.module.ts`
- Create: `apps/api/src/public/public.controller.ts`
- Create: `apps/api/src/public/public.service.ts`
- Modify: `apps/api/src/app.module.ts` (register module)
- Modify: `apps/api/src/common/decorators/public.decorator.ts` usage (mark handler `@Public()`)
- Modify: `packages/api-client/src/client.ts`
- Test: `apps/api/src/public/public.service.spec.ts`

**Interfaces:**
- Produces: `GET /v1/public/firms/:slug -> FirmBranding | 404`. Client: `api.public.branding(slug: string)`.

- [ ] **Step 1: Failing test**

`public.service.spec.ts`: `findBranding('acme')` returns branding for an ACTIVE firm, `null` for unknown, and marks `SUSPENDED`. Run and see FAIL.

- [ ] **Step 2: Implement service**

```ts
@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}
  async branding(slug: string): Promise<FirmBranding> {
    const firm = await this.prisma.firm.findUnique({ where: { slug: slug.toLowerCase() } });
    if (!firm) throw new NotFoundException('Firm not found');
    return {
      name: firm.name, slug: firm.slug, logoUrl: firm.logoUrl, brandColor: firm.brandColor,
      supportEmail: firm.supportEmail, supportPhone: firm.supportPhone, address: firm.address,
      status: firm.status as FirmBranding['status'],
    };
  }
}
```

- [ ] **Step 3: Controller**

```ts
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}
  @Public()
  @Get('firms/:slug')
  branding(@Param('slug') slug: string) { return this.publicService.branding(slug); }
}
```

- [ ] **Step 4: Register `PublicModule` in `app.module.ts`.**

- [ ] **Step 5: api-client**

Add to `GstFlowApi`:

```ts
public = {
  branding: (slug: string) => this.http.get<FirmBranding>(`/public/firms/${encodeURIComponent(slug)}`, { skipAuth: true }),
};
```

- [ ] **Step 6: Run test + typecheck.** Expected: PASS.

- [ ] **Step 7: Checkpoint.**

---

### Task 3: Firm-scoped login + reserved slugs

**Files:**
- Modify: `packages/types/src/api.ts` (`LoginBody`)
- Modify: `packages/validation/src/auth.ts` (login schema)
- Modify: `apps/api/src/auth/auth.service.ts` (`login`, ~line 128)
- Modify: `apps/api/src/auth/auth.controller.ts` (pass `firmSlug`)
- Modify: `apps/api/src/admin/admin.service.ts` (`createFirm`, `updateFirm`, reserved-slug guard)
- Create: `apps/api/src/common/slug.ts` (`RESERVED_SLUGS`, `assertSlugAllowed`)
- Test: `apps/api/src/common/slug.spec.ts`, extend `admin.service.spec.ts`, `auth` e2e

**Interfaces:**
- Produces: `LoginBody.firmSlug?: string`. `assertSlugAllowed(slug: string): void` throws `BadRequestException`.

- [ ] **Step 1: Failing slug test**

```ts
expect(() => assertSlugAllowed('login')).toThrow();
expect(() => assertSlugAllowed('Acme')).not.toThrow();
```

- [ ] **Step 2: Implement `common/slug.ts`**

```ts
export const RESERVED_SLUGS = new Set(['login','logout','api','admin','_next','public','static','assets','favicon.ico','robots.txt','sitemap.xml','health']);
export function assertSlugAllowed(slug: string): void {
  if (RESERVED_SLUGS.has(slug.trim().toLowerCase())) throw new BadRequestException(`"${slug}" is a reserved path`);
}
```

- [ ] **Step 3: Call `assertSlugAllowed` in `AdminService.createFirm`/`updateFirm` and persist branding/fee fields.**

- [ ] **Step 4: Add `firmSlug` to login**

In `AuthService.login(email, password, ip?, firmSlug?)`: after loading the user, if `firmSlug` is provided and `user.role !== Role.SUPER_ADMIN`, load `user.firm.slug` and reject with `UnauthorizedException('Invalid firm or credentials')` on mismatch (case-insensitive). Update controller + validation schema (`firmSlug: z.string().max(60).optional()`).

- [ ] **Step 5: Tests** — slug spec, admin reserved-slug rejection, login mismatch 401. Run: `pnpm --filter @gstflow/api test`. Expected: PASS.

- [ ] **Step 6: Checkpoint.**

---

### Task 4: `apps/web` path-based tenancy + branding

**Files:**
- Move: `apps/web/app/(auth)/login/page.tsx` → `apps/web/app/[firm]/login/page.tsx`
- Move: `apps/web/app/(dashboard)/**` → `apps/web/app/[firm]/(dashboard)/**`
- Create: `apps/web/app/[firm]/layout.tsx`
- Create: `apps/web/app/[firm]/FirmBrandingProvider.tsx`
- Create: `apps/web/lib/branding.ts` (server `getBranding(slug)` calling API base URL or client fetch)
- Modify: `apps/web/lib/auth.tsx` (login takes `firmSlug`; logout/unauthorized redirect to `/<slug>/login`)
- Modify: `apps/web/lib/api.ts` (`onUnauthorized` uses current slug)
- Modify: `apps/web/app/layout.tsx`, `apps/web/app/page.tsx` (root redirect)
- Modify: dashboard layout header to render logo/name/brand color
- Test: manual + `pnpm --filter @gstflow/web typecheck`

**Interfaces:**
- Consumes: `api.public.branding(slug)`, `api.auth.login({ firmSlug, email, password })`.
- Produces: `useFirmBranding(): FirmBranding | null` context hook.

- [ ] **Step 1: Move routes under `app/[firm]/`.** Use `git mv` so history is kept. Update all internal `Link href`/`router.push` to be slug-prefixed (build a `useFirmPath()` helper returning `(p) => '/'+slug+p`).

- [ ] **Step 2: `[firm]/layout.tsx`** — server component; `const branding = await getBranding(params.firm)`; if 404 render `<FirmNotFound/>`; if `status === 'SUSPENDED'` render `<FirmSuspended/>`; else wrap children in `<FirmBrandingProvider value={branding}>`.

- [ ] **Step 3: Branded login** — show logo/name/color; submit `{ firmSlug: params.firm, email, password }`; on success `router.replace('/'+slug)`.

- [ ] **Step 4: Auth redirects** — `logout`/`onUnauthorized` redirect to `/<currentSlug>/login` (fallback `/login`).

- [ ] **Step 5: Generic `/login`** — a small form that takes a firm code and redirects to `/<code>/login`.

- [ ] **Step 6: Header branding** — render `branding.logoUrl` (img), `branding.name`, and apply `branding.brandColor` to the primary accent (CSS variable `--brand`).

- [ ] **Step 7: Typecheck + dev smoke.** `pnpm --filter @gstflow/web typecheck`; start dev and load `/acme/login`.

- [ ] **Step 8: Checkpoint.**

---

### Task 5: Rebuild `apps/admin` control plane

**Files:**
- Modify: `apps/admin/app/(dashboard)/page.tsx` (overview + billing totals placeholder)
- Modify: `apps/admin/app/(dashboard)/firms/page.tsx` (add branding columns + Edit)
- Create: `apps/admin/components/firms/FirmForm.tsx` (replace — full create with branding + fee)
- Create: `apps/admin/components/firms/FirmEditDialog.tsx` (edit branding + create firm admin)
- Modify: `apps/admin/lib/api.ts` if needed
- Modify: `packages/api-client/src/client.ts` (`admin.firms.get`, branding fields on update)
- Test: `pnpm --filter @gstflow/admin typecheck`; manual CRUD

**Interfaces:**
- Consumes: `api.admin.firms.create/update/get`, `api.admin.users.create`.
- Produces: firm create/edit with `slug`, `logoUrl`, `brandColor`, `supportEmail`, `supportPhone`, `address`, `defaultFilingFee`; "Create firm admin" action.

- [ ] **Step 1: Add `admin.firms.get`** to api-client (`GET /admin/firms/:id`) and a `GET` controller if absent.
- [ ] **Step 2: Replace `FirmForm`** with sections Identity / Branding / Billing / Status.
- [ ] **Step 3: `FirmEditDialog`** — PATCH branding fields; a nested "Create firm admin" mini-form posting `{ name, email, password, role: 'FIRM_ADMIN', firmId }`.
- [ ] **Step 4: Overview** — keep counts; add a Billing card (values render once Phase 2 lands).
- [ ] **Step 5: Typecheck + manual smoke** (`/firms` create + edit with a logo URL and fee).
- [ ] **Step 6: Checkpoint.**

---

## Phase 2 — Firm billing / receivables

### Task 6: Schema, types & validation for payments

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Filing fee + Payment + PaymentLink + enums)
- Modify: `packages/types/src/enums.ts`
- Modify: `packages/types/src/entities.ts`
- Modify: `packages/types/src/api.ts`
- Create: `packages/validation/src/payment.ts`; export from `index.ts`; extend `filing.ts`

**Interfaces:**
- Produces: enums `PaymentStatus`, `PaymentMethod`; types `PaymentState = 'NONE'|'UNPAID'|'PARTIAL'|'PAID'`, `Payment`, `PaymentLink`; `Filing.feeAmount/paidAmount/balanceAmount/paymentState`; bodies `CreatePaymentBody`, `UpdatePaymentBody`, `PaymentLinkBody`, `ListPaymentsQuery`, `ReceivablesSummary`, `PlatformBillingSummary`.

- [ ] **Step 1: Prisma models** exactly as in the spec §5 (`Filing.feeAmount`, `Payment`, `PaymentLink`, enums; add `payments Payment[]` to `Firm` and `Client`).
- [ ] **Step 2: Migrate:** `pnpm --filter @gstflow/api exec prisma migrate dev --name payments`.
- [ ] **Step 3: Types** — add enums, entities, and `PaymentState`; extend `Filing`.
- [ ] **Step 4: Validation** — `payment.ts`:

```ts
export const createPaymentSchema = z.object({
  amount: z.number().positive().max(10_000_000),
  status: z.nativeEnum(PaymentStatus).optional(),
  method: z.nativeEnum(PaymentMethod).optional(),
  paidAt: z.string().datetime().optional(),
  reference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});
export const updatePaymentSchema = createPaymentSchema.partial();
export const paymentLinkSchema = z.object({ label: z.string().min(1).max(100), url: z.string().url().max(2048) });
export const listPaymentsQuerySchema = z.object({ page: z.coerce.number().optional(), pageSize: z.coerce.number().optional(), clientId: z.string().optional(), status: z.nativeEnum(PaymentStatus).optional(), from: z.string().optional(), to: z.string().optional() });
```

Extend `createFilingSchema`/add `updateFilingSchema` with `feeAmount: z.number().nonnegative().max(1_000_000).optional()`.

- [ ] **Step 5: Typecheck.** Expected: PASS.

- [ ] **Step 6: Checkpoint.**

---

### Task 7: Payments API module + filing fee + receivables

**Files:**
- Create: `apps/api/src/payments/payments.module.ts`, `payments.service.ts`, `payments.controller.ts`, `dto.ts`
- Modify: `apps/api/src/filings/filings.service.ts` (fee persistence + serialise balances)
- Modify: `apps/api/src/filings/filings.controller.ts` (+ `PATCH /filings/:id`)
- Modify: `apps/api/src/filings/dto.ts`
- Modify: `apps/api/src/common/serializers.ts` (`serialiseFiling` balance fields; `serialisePayment`, `serialisePaymentLink`)
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/payments/payments.service.spec.ts` (unit), `apps/api/test/payments.e2e-spec.ts`

**Interfaces:**
- Produces: `PaymentsService.create/listForFiling/update/remove/addLink/removeLink/list/receivables`, `derivePaymentState(fee, paid)`.

- [ ] **Step 1: Failing unit tests** for `derivePaymentState(null,0)==='NONE'`, `(1000,0)==='UNPAID'`, `(1000,400)==='PARTIAL'`, `(1000,1500)==='PAID'`; and that `create` rejects a filing outside the actor's firm with `NotFoundException`.

- [ ] **Step 2: Implement `derivePaymentState` + service.** Aggregate `COMPLETED` payments per filing. `receivables`: group by client, return `{ clientId, clientName, billed, collected, outstanding, filingsCount }`.

- [ ] **Step 3: Controller** with the spec §7 routes, `@Roles(...STAFF_ROLES)`, firm-scoped.

- [ ] **Step 4: Filing fee + balances** — persist `feeAmount` on create/update; `serialiseFiling` computes `paidAmount`, `balanceAmount`, `paymentState` from included `payments`.

- [ ] **Step 5: e2e** — create firm+client+filing(800), add 500 then 300, assert `UNPAID→PARTIAL→PAID`, receivables totals, cross-firm 404. Run: `pnpm --filter @gstflow/api test:e2e`. Expected: PASS.

- [ ] **Step 6: Checkpoint.**

---

### Task 8: api-client payments + admin billing

**Files:**
- Modify: `packages/api-client/src/client.ts`

**Interfaces:**
- Produces: `api.payments.{createForFiling,listForFiling,update,remove,addLink,removeLink,list,receivables}`, `api.filings.update(id, body)`, `api.admin.billing.platform()`, `api.admin.billing.firm(id)`.

- [ ] **Step 1: Add the wrapper methods** matching spec §7 paths.
- [ ] **Step 2: Typecheck `@gstflow/api-client` + dependent apps.**

- [ ] **Step 3: Checkpoint.**

---

### Task 9: Firm billing UI

**Files:**
- Modify: `apps/web/app/[firm]/(dashboard)/filings/page.tsx` (fee input on create/update; balance columns)
- Create: `apps/web/components/payments/PaymentsPanel.tsx` (list/add/edit/delete payments + proof links)
- Create: `apps/web/components/payments/ReceivablesSummary.tsx`
- Create: `apps/web/app/[firm]/(dashboard)/receivables/page.tsx`
- Modify: `apps/web/app/[firm]/(dashboard)/clients/[id]/page.tsx` (dues section)
- Modify: nav in dashboard layout

**Interfaces:**
- Consumes: `api.payments.*`, `api.filings.update`.

- [ ] **Step 1: Filing fee field** — prefill from `firm.defaultFilingFee` (from branding/provider); include `feeAmount` in create and `api.filings.update`.
- [ ] **Step 2: `PaymentsPanel`** — per filing; add payment (amount/status/method/paidAt/reference/notes), edit status, delete, add/remove proof links; show paid/balance/state.
- [ ] **Step 3: Receivables page** — table (client, billed, collected, outstanding, count), filter by month/status; drill-down to client.
- [ ] **Step 4: Client detail dues** — list filings with balance + payments.
- [ ] **Step 5: Typecheck + manual smoke.**

- [ ] **Step 6: Checkpoint.**

---

### Task 10: Super admin billing oversight

**Files:**
- Modify: `apps/admin/app/(dashboard)/page.tsx` (platform billed/collected/outstanding)
- Create: `apps/admin/app/(dashboard)/billing/page.tsx` (per-firm table + drill-down)
- Create: `apps/admin/components/billing/FirmBillingDetail.tsx`
- Modify: `apps/admin/app/(dashboard)/layout.tsx` (nav item)

**Interfaces:**
- Consumes: `api.admin.billing.platform()`, `api.admin.billing.firm(id)`.

- [ ] **Step 1: Platform totals card** on overview.
- [ ] **Step 2: Billing page** per-firm rows with drill-down (read-only clients/filings/payments).
- [ ] **Step 3: Typecheck + manual smoke.**

- [ ] **Step 4: Checkpoint.**

---

### Task 11: Verification

- [ ] **Step 1: Run all typechecks:** `pnpm -r typecheck` (expect PASS).
- [ ] **Step 2: Run API tests:** `pnpm --filter @gstflow/api test && pnpm --filter @gstflow/api test:e2e` (expect PASS).
- [ ] **Step 3: Builds:** `pnpm --filter @gstflow/web build && pnpm --filter @gstflow/admin build` (expect success).
- [ ] **Step 4: Manual end-to-end:** as super admin create a firm (slug `acme`, logo, color, fee 800, firm admin user); log in at `/acme/login`; create a client + filing with fee 800; add payments 500/300; confirm filing shows PAID; check receivables; confirm admin billing totals.
- [ ] **Step 5: Cross-firm check:** second firm cannot see the first firm's filings/payments (404).
