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
| 4 | `POST /otp/ingest` + validation | pending | - |
| 5 | `GET /inbox` unified feed | pending | - |
| 6 | Admin OTP settings | pending | - |
| 7 | Firm web `/sms` OTP card | pending | - |
| 8 | Server e2e for grouping + inbox | pending | - |
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
