# Email + SMS OTP Aggregation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read the client's email on the phone, extract OTPs, forward them to the firm, and show one compact OTP card (grouped across SMS/email) in both the firm web inbox and the client mobile log.

**Architecture:** A shared `@gstflow/otp` extractor feeds a new server-side `OtpEvent` table. Incoming SMS are mined for OTPs; the native email poller forwards OTP events (`POST /otp/ingest`). A grouping service collapses identical codes within a rolling window, and `GET /inbox` serves one unified feed to both UIs. Native email connectors (IMAP, Gmail, Graph) keep credentials on the device and reuse the existing foreground-service + JobScheduler reliability pattern.

**Tech Stack:** NestJS + Prisma/PostgreSQL, Next.js App Router (web), React Native (bare Android), Kotlin/Jakarta Mail/Google Sign-In/MSAL, TanStack Query, Zod, Jest, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-04-email-otp-aggregation-design.md`

## Global Constraints

- **Additive only.** Do NOT rename or remove existing fields on Prisma models, `@gstflow/types`, `@gstflow/validation`, or `@gstflow/api-client`.
- Firm-scoped endpoints scope by `actor.firmId`; cross-firm access returns **404** (never 403). `SUPER_ADMIN` bypasses.
- **Full email body is never uploaded or stored.** Only OTP code + `fromAddress` + `subject` + a ~120-char `snippet` (code masked) + `receivedAt`.
- Grouping window default **300 seconds**, stored in `SystemSetting` key `otp.settings` (`{ groupWindowSeconds, emailEnabled, providersEnabled }`).
- The grouped feed is **server-backed for both UIs** (spec decision 7); the mobile log overlays its not-yet-synced local queue.
- Rebuild shared packages after edits: `npm run build --workspace @gstflow/types` (and `@gstflow/validation`, `@gstflow/otp`, `@gstflow/api-client`).
- Run commands from `/workspace`. API tests: `npm run test --workspace @gstflow/api`; e2e: `npm run test:e2e --workspace @gstflow/api -- <name>`.
- Android: minSdk 24, compile/target 34. Release build: `cd apps/mobile/android && ANDROID_HOME=/opt/android-sdk /opt/gradle-8.8/bin/gradle :app:assembleRelease -PapiBaseUrl=https://gst.keerainnovations.com/api --rerun-tasks`.
- **Commits:** the repo owner requires changes are not committed unless explicitly requested. Treat every "Commit" step as a checkpoint: stage files and leave uncommitted unless the user asks.

---

## Phase 1 — Shared extractor + server OTP core

### Task 1: `@gstflow/otp` extractor package

**Files:**
- Create: `packages/otp/package.json`
- Create: `packages/otp/tsconfig.json`
- Create: `packages/otp/src/index.ts`
- Create: `packages/otp/fixtures/otp-fixtures.json`
- Create: `packages/otp/src/index.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `extractOtp(input: string): { code: string; snippet: string } | null`; fixture array `[{ text, expect: { code } | null, note }]`.

- [ ] **Step 1: Create the package manifest** (mirror `packages/types/package.json` scripts: `build` = `tsc -p tsconfig.json`, `test` = `jest`).

- [ ] **Step 2: Write the fixture file** with at least these cases:

```json
[
  { "text": "123456 is your OTP for login. Do not share.", "expect": { "code": "123456" }, "note": "plain OTP" },
  { "text": "Use 4831 to verify your email", "expect": { "code": "4831" }, "note": "4 digit" },
  { "text": "Your one time password is A1B2C3", "expect": { "code": "A1B2C3" }, "note": "alphanumeric" },
  { "text": "GSTIN 29ABCDE1234F1Z5 invoice inv-8891 amount Rs. 12345", "expect": null, "note": "GST false positive" },
  { "text": "GSTR-3B for 2026-09 filed, ARN AA290926000123", "expect": null, "note": "ARN false positive" },
  { "text": "Your order shipped today", "expect": null, "note": "no OTP" }
]
```

- [ ] **Step 3: Write the failing test**

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractOtp } from './index';

const fixtures = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'otp-fixtures.json'), 'utf8'),
) as { text: string; expect: { code: string } | null; note: string }[];

describe('extractOtp', () => {
  it.each(fixtures)('$note', ({ text, expect: wanted }) => {
    const result = extractOtp(text);
    if (wanted) expect(result?.code).toBe(wanted.code);
    else expect(result).toBeNull();
  });

  it('masks the code inside the snippet', () => {
    const result = extractOtp('Your verification code is 778899 now');
    expect(result?.code).toBe('778899');
    expect(result?.snippet).not.toContain('778899');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails** — `npm run test --workspace @gstflow/otp` → FAIL (module not found).

- [ ] **Step 5: Implement the extractor**

```ts
const KEYWORD = /\b(otp|one[\s-]?time[\s-]?password|verification[\s-]?code|security[\s-]?code|login[\s-]?code|code)\b/i;
const GST_NOISE = /\b(gstin|gstn|gstr|arn|invoice|hsn|tax|amount|rs\.?)\b/i;
const TOKEN = /\b[A-Za-z0-9]{4,8}\b/g;

export interface ExtractedOtp { code: string; snippet: string; }

export function extractOtp(input: string): ExtractedOtp | null {
  if (!input) return null;
  const match = KEYWORD.exec(input);
  if (!match) return null;
  const tail = input.slice(match.index, match.index + 160);
  if (GST_NOISE.test(tail)) return null;
  const tokens = tail.match(TOKEN) ?? [];
  const token = tokens.find((value) => /[0-9]/.test(value) && !/^(otp|code)$/i.test(value));
  if (!token) return null;
  const start = Math.max(0, match.index - 40);
  const end = Math.min(input.length, match.index + 120);
  const snippet = `${input.slice(start, end).replace(token, '••••')}`.replace(/\s+/g, ' ').trim();
  return { code: token.toUpperCase(), snippet };
}
```

- [ ] **Step 6: Run the test to verify it passes** — `npm run test --workspace @gstflow/otp` → PASS (all fixtures).
- [ ] **Step 7: Commit checkpoint** — `git add packages/otp && git commit -m "feat(otp): shared OTP extractor with shared fixtures"`.

### Task 2: Prisma `OtpEvent` model + shared types

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add enum + model).
- Modify: `packages/types/src/entities.ts` (add `OtpSource`, `OtpEvent`).
- Modify: `packages/types/src/enums.ts` if enums live there (check first).
- Modify: `packages/types/src/index.ts` (re-export if needed).
- Create: migration via prisma.

**Interfaces:**
- Produces: `OtpSource` enum; `OtpEvent` interface `{ id, firmId, clientId, deviceId, code, source, fromAddress, subject, snippet, receivedAt, groupId, createdAt }`.

- [ ] **Step 1: Add to the schema**

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
  fromAddress String?
  subject     String?
  snippet     String?
  receivedAt  DateTime
  sourceRef   String?
  groupId     String?
  createdAt   DateTime  @default(now())

  @@unique([clientId, source, sourceRef])
  @@index([firmId, receivedAt])
  @@index([clientId, code, receivedAt])
  @@index([groupId])
}
```

- [ ] **Step 2: Generate the migration** — `npm run db:migrate --workspace @gstflow/api -- --name otp_events` (additive; no data loss).
- [ ] **Step 3: Add the shared types** to `packages/types/src/entities.ts`:

```ts
export type OtpSource = 'SMS' | 'EMAIL';

export interface OtpEvent {
  id: string;
  firmId: string;
  clientId: string;
  deviceId: string | null;
  code: string;
  source: OtpSource;
  fromAddress: string | null;
  subject: string | null;
  snippet: string | null;
  receivedAt: string;
  groupId: string | null;
  createdAt: string;
}
```

- [ ] **Step 4: Rebuild types** — `npm run build --workspace @gstflow/types` → no errors.
- [ ] **Step 5: Commit checkpoint**.

### Task 3: Extract OTPs from SMS on ingest + backfill

**Files:**
- Create: `apps/api/src/otp/otp.service.ts`
- Create: `apps/api/src/otp/otp.module.ts`
- Modify: `apps/api/src/app.module.ts` (import `OtpModule`).
- Modify: `apps/api/src/sms/sms.service.ts` (call `otp.recordFromSms`).
- Test: `apps/api/src/otp/otp.service.spec.ts`

**Interfaces:**
- Consumes: `extractOtp` from `@gstflow/otp`.
- Produces: `OtpService.recordFromSms({ firmId, clientId, deviceId, code, snippet, receivedAt, sourceRef }): Promise<void>`; `OtpService.recordEmailEvents(actor, items): Promise<{ accepted, duplicates, rejected, ids }>`; `OtpService.listFeed(actor, query): Promise<PaginatedInbox>` (feed type defined in Task 5); `OtpService.groupWindowSeconds(): Promise<number>` (reads `SystemSetting` key `otp.settings`, falling back to 300).

- [ ] **Step 1: Write the failing test** for the grouping helper:

```ts
import { groupKeyFor } from './otp.service';

describe('groupKeyFor', () => {
  const base = new Date('2026-10-04T10:00:00.000Z');
  it('reuses a group when the same code is inside the window', () => {
    const prev = { id: 'g1', receivedAt: base };
    expect(groupKeyFor(prev, new Date(base.getTime() + 60_000), 300)).toBe('g1');
  });
  it('starts a new group outside the window', () => {
    const prev = { id: 'g1', receivedAt: base };
    expect(groupKeyFor(prev, new Date(base.getTime() + 600_000), 300)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `npm run test --workspace @gstflow/api -- otp.service.spec.ts` → FAIL.
- [ ] **Step 3: Implement `OtpService`** (core logic shown):

```ts
export function groupKeyFor(
  previous: { id: string; receivedAt: Date } | null,
  receivedAt: Date,
  windowSeconds: number,
): string | null {
  if (!previous) return null;
  const delta = Math.abs(receivedAt.getTime() - previous.receivedAt.getTime());
  return delta <= windowSeconds * 1000 ? previous.id : null;
}

private async resolveGroup(clientId: string, code: string, receivedAt: Date): Promise<string | null> {
  const windowSeconds = await this.groupWindowSeconds();
  const previous = await this.prisma.otpEvent.findFirst({
    where: { clientId, code, groupId: { not: null } },
    orderBy: { receivedAt: 'desc' },
    select: { groupId: true, receivedAt: true },
  });
  return groupKeyFor(previous ? { id: previous.groupId!, receivedAt: previous.receivedAt } : null, receivedAt, windowSeconds);
}

async recordFromSms(input: { firmId; clientId; deviceId: string | null; code; snippet; receivedAt; sourceRef }): Promise<void> {
  const groupId = (await this.resolveGroup(input.clientId, input.code, input.receivedAt)) ?? undefined;
  try {
    const created = await this.prisma.otpEvent.create({
      data: {
        firmId: input.firmId, clientId: input.clientId, deviceId: input.deviceId,
        code: input.code, source: 'SMS', fromAddress: null, subject: null,
        snippet: this.crypto.encrypt(input.snippet), receivedAt: input.receivedAt,
        sourceRef: input.sourceRef, groupId: groupId ?? undefined,
      },
      select: { id: true, groupId: true },
    });
    if (!created.groupId) await this.prisma.otpEvent.update({ where: { id: created.id }, data: { groupId: created.id } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
  }
}
```

  Note: `groupId` doubles as the group's first event id. Set it to the created event's own id when no prior group matched. The snippet is encrypted at rest (`snippet` column); decrypt on read.

- [ ] **Step 4: Run the test to verify it passes**.
- [ ] **Step 5: Wire into `sms.ingest`** — extend the existing `targets` query to select `firmId` too (`select: { id: true, firmId: true }`), build `const firmOfClient = new Map(targets.map((t) => [t.id, t.firmId]))` once before the loop, then after `persistParsed(created.id, item.body)` call:

```ts
const otp = extractOtp(item.body);
if (otp) {
  await this.otp.recordFromSms({
    firmId: firmOfClient.get(targetId)!,
    clientId: targetId, deviceId,
    code: otp.code, snippet: otp.snippet, receivedAt, sourceRef: created.id,
  });
}
```

  Inject `OtpService` into `SmsService`'s constructor and import `OtpModule` into `SmsModule` (avoid a circular import by exporting `OtpService` from `OtpModule` and importing `OtpModule` into `SmsModule`).
- [ ] **Step 6: Backfill script** — `apps/api/src/otp/backfill-otp.ts` iterating `SmsMessage` where no matching `OtpEvent(sourceRef=id)` exists, extracting and inserting; idempotent via the unique key.
- [ ] **Step 7: Commit checkpoint**.

### Task 4: `POST /otp/ingest` + validation

**Files:**
- Create: `apps/api/src/otp/otp.controller.ts`
- Create: `apps/api/src/otp/dto.ts`
- Modify: `packages/validation/src/otp.ts` (new), `packages/validation/src/index.ts`
- Modify: `packages/types/src/api.ts` (`OtpIngestItem/Body/Response`)
- Test: `apps/api/test/otp-ingest.e2e-spec.ts`

**Interfaces:**
- Produces: `POST /v1/otp/ingest` → `{ accepted: number; duplicates: number; rejected: number; ids: string[] }`.

- [ ] **Step 1: Add the Zod schema**

```ts
export const otpIngestItemSchema = z.object({
  code: z.string().min(3).max(12),
  source: z.literal('EMAIL'),
  fromAddress: z.string().max(320).optional(),
  subject: z.string().max(500).optional(),
  snippet: z.string().max(400).optional(),
  receivedAt: z.string().datetime(),
  deviceId: z.string().optional(),
  sourceRef: z.string().min(4).max(200),
});
export const otpIngestSchema = z.object({ items: z.array(otpIngestItemSchema).min(1).max(200) });
```

- [ ] **Step 2: Controller** (`@Roles(Role.CLIENT)`, mirror `sms.controller.ts`):

```ts
@Controller('otp')
export class OtpController {
  @Post('ingest')
  ingest(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(otpIngestSchema)) body: OtpIngestBody) {
    return this.otp.recordEmailEvents(actor, body.items);
  }
}
```

- [ ] **Step 3: Service** resolves the same ACTIVE linked firms as `sms.ingest` (reuse a shared helper) and creates one `OtpEvent(source=EMAIL)` per target firm, resolving `groupId` via `resolveGroup`. Consent check identical to SMS.
- [ ] **Step 4: e2e** — login as the seeded client via OTP is hard in e2e; instead unit-test `recordEmailEvents` with a mocked Prisma, and add an e2e that posts with a CLIENT token obtained through the existing OTP dev echo (`OTP_DEV_ECHO=true` locally). Assert idempotency (same `sourceRef` twice → `duplicates: 1`).
- [ ] **Step 5: Rebuild validation + types**, run tests.
- [ ] **Step 6: Commit checkpoint**.

### Task 5: `GET /inbox` unified feed

**Files:**
- Create: `apps/api/src/inbox/inbox.service.ts`, `apps/api/src/inbox/inbox.controller.ts`, `apps/api/src/inbox/inbox.module.ts`
- Modify: `apps/api/src/app.module.ts`, `packages/types/src/api.ts`, `packages/api-client/src/client.ts`
- Test: `apps/api/src/inbox/inbox.service.spec.ts`

**Interfaces:**
- Produces:

```ts
export type InboxItem =
  | { kind: 'OTP'; id: string; code: string; sources: ('SMS' | 'EMAIL')[]; client: { id: string; name: string };
      from: string | null; subject: string | null; snippet: string | null; receivedAt: string; latestAt: string; eventCount: number }
  | { kind: 'SMS'; /* existing SmsMessage shape */ };

export interface PaginatedInbox { items: InboxItem[]; total: number; page: number; pageSize: number; totalPages: number; }
```

- [ ] **Step 1: Grouping query** — fetch `OtpEvent` groups scoped by `actor.firmId` (newest group within the page window), then fetch non-OTP SMS (those whose id is not referenced by any `OtpEvent.sourceRef` for that client) and merge, sort by `latestAt`/`receivedAt` desc, paginate in memory over an over-fetched window (cap e.g. 500). Document the cap.
- [ ] **Step 2: Controller** `@Get('inbox')` with the same filters as `/sms` (clientId, category for SMS, search).
- [ ] **Step 3: api-client** `api.inbox.list(query)`; rebuild.
- [ ] **Step 4: Unit test** asserts: SMS+EMAIL same code within window → single OTP item with `sources: ['SMS','EMAIL']` and `eventCount: 2`; outside window → two items; non-OTP SMS still appears as `kind:'SMS'`.
- [ ] **Step 5: Commit checkpoint**.

### Task 6: Admin OTP settings

**Files:**
- Create: `apps/api/src/settings/otp-settings.service.ts`, `otp-settings.controller.ts`
- Modify: `packages/validation/src/admin.ts`, `packages/types/src/api.ts`, api-client
- Test: `apps/api/src/settings/otp-settings.service.spec.ts`

**Interfaces:**
- `GET/PUT /v1/admin/settings/otp` (`SUPER_ADMIN`) with `{ groupWindowSeconds: number (30..3600), emailEnabled: boolean, providersEnabled: { imap: boolean, gmail: boolean, graph: boolean } }`; `SystemSetting` key `otp.settings`.

- [x] **Step 1: Service** default `{ groupWindowSeconds: 300, emailEnabled: true, providersEnabled: { imap: true, gmail: true, graph: true } }`, `getConfig`/`updateConfig` mirroring `SmsKeywordService`.
- [x] **Step 2: Validation + types + api-client namespace** `admin.settings.otp.*`.
- [x] **Step 3: Unit test** defaults + clamping.
- [x] **Step 4: Commit checkpoint**.

### Task 7: Firm web `/sms` OTP card

**Files:**
- Create: `apps/web/components/sms/OtpCard.tsx`
- Modify: `apps/web/app/[firm]/(dashboard)/sms/page.tsx` (query `api.inbox.list`, render rows by `kind`).
- Modify: `apps/web/components/sms/classification.ts` (re-export `extractOtp` from `@gstflow/otp`; delete the local copy).
- Modify: `apps/web/package.json` (add `@gstflow/otp` workspace dep).

**Interfaces:**
- Consumes: `InboxItem` from `@gstflow/types`.

- [x] **Step 1: `OtpCard`**

```tsx
export function OtpCard({ item }: { item: Extract<InboxItem, { kind: 'OTP' }> }) {
  return (
    <div className="flex items-start gap-3">
      <span className="font-mono text-lg font-bold tracking-widest text-slate-900">{item.code}</span>
      <div className="flex flex-wrap gap-1">
        {item.sources.map((s) => (
          <Badge key={s} tone={s === 'EMAIL' ? 'blue' : 'gray'}>{s === 'EMAIL' ? 'Email' : 'SMS'}</Badge>
        ))}
        {item.eventCount > 1 ? <span className="text-xs text-slate-400">x{item.eventCount}</span> : null}
      </div>
    </div>
  );
}
```

- [x] **Step 2: Page** renders `OtpCard` + `from`/`subject`/`snippet` for `kind:'OTP'`, and the existing row for `kind:'SMS'`. Keep filters/pagination.
- [x] **Step 3: Detail** — `/sms/[id]` unchanged for SMS; add an OTP group detail panel listing each `OtpEvent` (source, from, subject, time).
- [x] **Step 4: Typecheck** `npm run typecheck --workspace @gstflow/web`.
- [x] **Step 5: Commit checkpoint**.

### Task 8: Server e2e for grouping + inbox

**Files:**
- Test: `apps/api/test/otp-inbox.e2e-spec.ts`

- [ ] **Step 1: Test** — seed one client with ACTIVE link; POST an SMS ingest containing an OTP body; POST `/otp/ingest` with the same code < window later; GET `/inbox` as the firm → one OTP item, `sources` both, `eventCount: 2`. POST a different code → separate item. Cross-firm token → the item is not returned.
- [ ] **Step 2: Run** `npm run test:e2e --workspace @gstflow/api -- otp-inbox.e2e-spec.ts` → PASS.
- [ ] **Step 3: Commit checkpoint**.

---

## Phase 2 — Native email framework (Android)

### Task 9: Kotlin OTP extractor (parity with TS)

**Files:**
- Create: `apps/mobile/android/app/src/main/java/com/gstflow/client/email/OtpExtractor.kt`
- Create: `apps/mobile/android/app/src/test/java/com/gstflow/client/email/OtpExtractorTest.kt`
- Reuse: `packages/otp/fixtures/otp-fixtures.json` (copy into `app/src/test/resources/`).

**Interfaces:**
- Produces: `data class ExtractedOtp(val code: String, val snippet: String)`, `object OtpExtractor { fun extract(input: String?): ExtractedOtp? }`.

- [ ] **Step 1: Port the TS regex/keyword/noise logic verbatim.**
- [ ] **Step 2: Test** loads the same JSON fixtures and asserts identical results. Run `gradle :app:testReleaseUnitTest --tests "*OtpExtractorTest*"`.
- [ ] **Step 3: Commit checkpoint.**

### Task 10: Encrypted account store + registry

**Files:**
- Create: `apps/mobile/android/app/src/main/java/com/gstflow/client/email/EmailAccounts.kt`
- Modify: `apps/mobile/android/app/build.gradle` (add `androidx.security:security-crypto`).

**Interfaces:**
- Produces: `object EmailAccounts` with `save(account: EmailAccount)`, `get(id): EmailAccount?`, `list(): List<EmailAccount>`, `remove(id)`, `setCursor(id, cursor)`, `markStatus(id, lastPolledAt, error?)`. `EmailAccount { id, provider: 'IMAP'|'GMAIL'|'GRAPH', address, imapHost?/imapPort?, secretRef?, oauthTokenJson?, cursor?, enabled }`.

- [ ] **Step 1: Implement** using `EncryptedSharedPreferences` (MasterKey AES256_GCM). Secrets never serialized to plain prefs.
- [ ] **Step 2: Unit test** round-trip save/get/remove with a mocked context (Robolectric) or a small instrumentation-free wrapper.
- [ ] **Step 3: Commit checkpoint.**

### Task 11: `EmailConnector` interface + IMAP connector

**Files:**
- Create: `.../email/EmailConnector.kt`, `.../email/ImapConnector.kt`
- Modify: `apps/mobile/android/app/build.gradle` (add `com.sun.mail:android-mail`).

**Interfaces:**
- `interface EmailConnector { fun id(): String; fun listOtpCandidates(since: String?): List<RawMail> }`; `RawMail { messageId, from, subject, snippetBody, receivedAt }`.

- [ ] **Step 1: IMAP** connects SSL (`imaps`, 993), opens INBOX (read-only), searches `SINCE` the cursor date, maps the most recent ~50 messages to `RawMail`, and returns the max UID as the new cursor.
- [ ] **Step 2: Test** parsing/mapping with a fake `Folder`/`Message` (Mockito) — no live network.
- [ ] **Step 3: Commit checkpoint.**

### Task 12: Poller + outbox + retry job

**Files:**
- Create: `.../email/EmailPoller.kt`, `.../email/EmailOtpOutbox.kt`, `.../email/EmailRetryJobService.kt`
- Modify: `.../sms/SmsForegroundService.kt` (invoke `EmailPoller.pollAll(context)` on its cadence), `AndroidManifest.xml` (register `EmailRetryJobService`), `MainApplication.kt` (reschedule job).

**Interfaces:**
- `EmailPoller.pollAll(context)` runs each enabled account through its connector, runs `OtpExtractor` on `RawMail.snippetBody`, enqueues `{code, fromAddress, subject, snippet, receivedAt, sourceRef=messageId, accountId}` into `EmailOtpOutbox`, then attempts `EmailUploader.upload`.
- `EmailUploader` mirrors `SmsUploader`: `POST /otp/ingest`, 8s timeouts, 401 → native token refresh (reuse the `66fc7f2` pattern), else persist + schedule `EmailRetryJobService` (network-constrained, persisted).

- [ ] **Step 1: Implement outbox** (JSON list in `gstflow_email_outbox` prefs, cap 500, dedup by `sourceRef`).
- [ ] **Step 2: Implement `EmailUploader`** by copying `SmsUploader` and swapping the path/body.
- [ ] **Step 3: Implement `EmailRetryJobService`** mirroring `SmsRetryJobService`.
- [ ] **Step 4: Wire** poll on the foreground-service tick (default 15 min) and enqueue the job on failure.
- [ ] **Step 5: Manual test** with a throwaway IMAP mailbox and airplane-mode toggling; verify outbox drains.
- [ ] **Step 6: Commit checkpoint.**

### Task 13: RN bridge + JS wrapper + consent

**Files:**
- Create: `.../email/EmailAccountModule.kt`, `.../email/EmailAccountPackage.kt`
- Create: `apps/mobile/src/native/EmailAccounts.ts`
- Modify: `MainApplication.kt` (add package), `apps/mobile/src/lib/storage.ts` (email consent key), `apps/mobile/src/lib/auth.tsx` (mirror consent).

**Interfaces:**
- `@ReactMethod addImapAccount(address, password, host, port, promise)`; `listAccounts(promise)`; `removeAccount(id, promise)`; `setEnabled(id, enabled, promise)`; plus Gmail/Graph link methods (Task 15/16).
- JS `EmailAccounts.addImapAccount(...)`, `.list()`, `.remove(id)`, `.setEnabled(id, enabled)`.

- [ ] **Step 1: Module** validates input, stores via `EmailAccounts`, kicks a poll, resolves `{ ok: true }`.
- [ ] **Step 2: JS wrapper** with a non-Android no-op fallback (mirror `SmsReader.ts`).
- [ ] **Step 3: Consent** gate: `EmailPoller` skips accounts until `EmailAccounts.setConsent(true)` has been called (stored in sync prefs).
- [ ] **Step 4: Commit checkpoint.**

### Task 14: Mobile email settings screen

**Files:**
- Create: `apps/mobile/src/screens/Email/EmailSettingsScreen.tsx`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`, `Home` (entry point).

- [ ] **Step 1: Screen** lists linked accounts (provider, address, last polled, error), an "Add IMAP account" form (address/password/host/port), enable/disable + remove, and the email-consent toggle.
- [ ] **Step 2: Typecheck** `npm run typecheck --workspace @gstflow/mobile`.
- [ ] **Step 3: Commit checkpoint.**

---

## Phase 3 — OAuth connectors

### Task 15: Gmail connector

**Files:**
- Create: `.../email/GmailConnector.kt`, `.../email/GmailLinkActivity.kt`
- Modify: `AndroidManifest.xml`, `EmailAccountModule.kt`, `build.gradle` (Google Play services auth).

**Interfaces:**
- Link via `GoogleSignIn` (scope `gmail.readonly`); store the OAuth token JSON in `EmailAccounts`; `listOtpCandidates` calls `GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=(otp OR "verification code" OR "one time password") newer_than:2d&maxResults=50`, then `GET .../messages/{id}?format=metadata` for headers + snippet; cursor = `historyId`.

- [ ] **Step 1: Implement** (no live test — mock the HTTP layer with OkHttp MockWebServer).
- [ ] **Step 2: Prereq note** in the task: requires a Google Cloud OAuth client (Android package + SHA-1) with Gmail readonly scope; restricted-scope verification needed for non-test users (spec §Privacy).
- [ ] **Step 3: Commit checkpoint.**

### Task 16: Microsoft Graph connector

**Files:**
- Create: `.../email/GraphConnector.kt`, `.../email/GraphLinkActivity.kt`
- Modify: `AndroidManifest.xml`, `EmailAccountModule.kt`, `build.gradle` (MSAL).

**Interfaces:**
- Link via MSAL (`Mail.Read`); `listOtpCandidates` calls `GET https://graph.microsoft.com/v1.0/me/messages?$search="otp"&$top=50&$select=id,from,subject,bodyPreview,receivedDateTime`; cursor = last `receivedDateTime`.

- [ ] **Step 1: Implement** with mock tests.
- [ ] **Step 2: Commit checkpoint.**

---

## Phase 4 — Mobile server-backed feed

### Task 17: Types + api-client additions

**Files:**
- Modify: `packages/types/src/api.ts` (`InboxItem`, `PaginatedInbox`, `OtpIngestBody`), `packages/api-client/src/client.ts` (`inbox.list`, `otp.ingest`).

- [ ] **Step 1: Add** the types/methods; rebuild `@gstflow/types`, `@gstflow/api-client`.
- [ ] **Step 2: Commit checkpoint.**

### Task 18: `SmsLogScreen` server feed + queued overlay

**Files:**
- Modify: `apps/mobile/src/screens/SmsLog/SmsLogScreen.tsx`
- Create: `apps/mobile/src/components/OtpCard.tsx`

- [ ] **Step 1: Fetch** `api.inbox.list()` (paginated) with TanStack Query; on 401 the existing refresh handles it.
- [ ] **Step 2: Overlay** locally-queued SMS (from `smsQueue.list()`) at the top, marked "Queued"; dedupe against server rows by hash/`sourceRef`.
- [ ] **Step 3: Render** `kind:'OTP'` with `OtpCard` (code, SMS/Email badges, from/subject, snippet); `kind:'SMS'` as today. Keep the "Sync now" action.
- [ ] **Step 4: Typecheck** and manually verify grouping against a local API.
- [ ] **Step 5: Commit checkpoint.**

### Task 19: Build, test, deploy, republish

- [ ] **Step 1:** `npm run typecheck --workspace @gstflow/api && npm run test --workspace @gstflow/api && npm run test:e2e --workspace @gstflow/api`.
- [ ] **Step 2:** Build API, rsync `apps/api/dist` to the remote, `pm2 restart gstflow-api --update-env`; verify `GET /v1/health` and a live `/inbox` call.
- [ ] **Step 3:** Build the release APK (`--rerun-tasks`), copy to `apps/web/public/gstflow-client.apk` + `gstflow-client-arm64.apk`, rsync, verify `Content-Length`.
- [ ] **Step 4:** Commit + push (only if the user asks).

---

## Self-Review Notes

- **Spec coverage:** providers (Tasks 11/15/16), on-device reading/extraction (9/11/12), OTP+context payload (4/10), grouping window (3/5), both surfaces (7/18), killed-app reliability (12). Server-backed feed decision honored in Task 18.
- **Open external prerequisites:** Google Cloud OAuth client + verification; Azure app registration + admin consent (Tasks 15/16).
- **Type consistency:** `OtpEvent`, `ExtractOtp`/`extractOtp`, `groupKeyFor`, `InboxItem` are introduced once and reused by name.
