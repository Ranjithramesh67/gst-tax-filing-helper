# Email + SMS OTP Aggregation — Execution Progress

Plan: `docs/superpowers/plans/2026-10-04-email-otp-aggregation.md`
Spec: `docs/superpowers/specs/2026-10-04-email-otp-aggregation-design.md`
Branch: `260930-feat-gstflow-platform`
Base commit: `6ba0665`
Execution mode: subagent-driven-development

## How to resume (for any model / API)

1. Read the plan and spec above (the plan has exact task text and code).
2. Check the status table below; the first task not marked `done` is the resume point.
3. Check `git log --oneline -15` and `.superpowers/sdd/progress.md` for the
   authoritative ledger + commits (the scratch dir is git-ignored).
4. Resume with subagent-driven-development: dispatch one implementer per task,
   then a task reviewer, then mark the task done here and commit this file.
5. Global constraints live in the plan's "Global Constraints" section — read them
   before implementing.
6. Commit after every task with the `Co-authored-by: monkeycode-ai <monkeycode-ai@chaitin.com>` trailer.

## Status

| # | Task | Status | Commits |
|---|------|--------|---------|
| 1 | `@gstflow/otp` extractor package | done (review clean) | `baa0131`, `7dc459a` |
| 2 | Prisma `OtpEvent` model + shared types | done (review clean) | `9df0791`, `aacd928` |
| 3 | Extract OTPs from SMS on ingest + backfill | done (review clean after fix) | `1f7e909`, `9a924e6`, `bef1212` |
| 4 | `POST /otp/ingest` + validation | done (review clean after fix) | `4b94840`, `666289f`, `22f7293`, `d8fb642`, `d602e1d` |
| 5 | `GET /inbox` unified feed | done (review clean after correction) | `36e6cae`, `32fd672`, `627fe7d`, `61b1fc2` |
| 6 | Admin OTP settings | done (review clean) | `cf55c3d`, `e83b589`, `c0dcb59`, `70800b4`, `38e0244`, `13f6e12` |
| 7 | Firm web `/sms` OTP card | done (review clean) | `39a09b0`, `88d192d`, `37280ac`, `0da3f63` |
| 8 | Server e2e for grouping + inbox (+ staff `/inbox` scoping fix) | done (review clean) | `3d10641`, `a277c9c` |
| 9 | Kotlin OTP extractor (parity) | pending | - |
| 10 | Encrypted account store + registry | pending | - |
| 11 | `EmailConnector` interface + IMAP | pending | - |
| 12 | Poller + outbox + retry job | pending | - |
| 13 | RN bridge + JS wrapper + consent | pending | - |
| 14 | Mobile email settings screen | pending | - |
| 15 | Gmail connector | pending | - |
| 16 | Microsoft Graph connector | pending | - |
| 17 | Types + api-client additions | pending | - |
| 18 | `SmsLogScreen` server feed + overlay | pending | - |
| 19 | Build, test, deploy, republish | pending | - |

## Blocker / notes

- (none blocking)
- **Task 5 layout deviation (intentional):** the plan listed new
  `apps/api/src/inbox/*` files, but the task brief directed `listFeed` into
  `OtpService` and the endpoint into the OTP area. Implemented as
  `OtpService.listFeed` + `InboxController` (`@Controller('inbox')`) registered in
  `OtpModule`, so `AppModule` needed no change. `listFeed` scopes OTP events by
  `firmId`+`clientId`, dedupes SMS referenced by `OtpEvent.sourceRef`, and caps the
  in-memory over-fetch at 500 rows per source.
- **SMS-body privacy boundary (Task 5 correction):** the spec's "full body never
  uploaded/stored" rule is **EMAIL-only**. `kind:'SMS'` in `/inbox` uses the
  existing `SmsMessage` shape via `serialiseSms` (full decrypted body), byte-parity
  with `/sms`; only OTP/email `snippet` is masked. Do not re-introduce SMS body
  truncation.
- **`/inbox` role scoping (corrected in Task 8):** `GET /inbox` and
  `GET /inbox/:id` serve CLIENT + FIRM_ADMIN + FILER + SUPER_ADMIN. Staff scope by
  `firmId` (all firm clients); clients by `firmId`+`clientId`; super admin
  unrestricted. `query.clientId` can never widen scope; cross-firm -> empty/404.
  `POST /otp/ingest` remains CLIENT-only. Do not re-introduce the CLIENT-only guard
  (it broke the firm web dashboard).
- **Commit trailer:** the repo's `prepare-commit-msg` hook auto-appends the
  `Co-authored-by: monkeycode-ai <monkeycode-ai@chaitin.com>` trailer. Do NOT add
  it manually in commit messages (it produces duplicates).
- **Task 1 minor findings (deferred to final review):** (a) mask regex is
  case-sensitive while codes are upper-cased; (b) selection window (±160) is wider
  than the snippet window (40 before/120 after) so chosen code and snippet can
  disagree; (c) "nearest token" still lets a preceding year win in e.g.
  `2026 OTP is 4831`.
- **Binding constraint for Tasks 3-4:** `OtpEvent.sourceRef` MUST always be
  non-null. Postgres treats NULLs as distinct in `@@unique([clientId, source,
  sourceRef])`, so a null ref would defeat dedupe. Task 3 SMS path uses the
  `SmsMessage.id`; Task 4 email path requires `sourceRef` (min 4 chars, the
  provider message id).
- **Task 2 environment note:** `prisma migrate dev` reset the local DB due to a
  pre-existing migration checksum mismatch, then replayed all migrations. Local DB
  was re-seeded via `npm run db:seed --workspace @gstflow/api`. Before deploy
  (Task 19) verify remote `_prisma_migrations` checksums are consistent with the
  committed migration files (esp. `20261003160000_rbac_roles_permissions`).
