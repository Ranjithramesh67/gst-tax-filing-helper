# SMS Parsing Depth & Filing Status History — Design Spec

Date: 2026-10-04
Status: Approved
Depends on: GSTFlow design (2026-09-30), Deadline reminders (2026-10-04)

## 1. Problem

`ParsedGstData` only captures invoice-shaped fields (amount, GSTIN, due date).
GSTN acknowledgement SMS carry the compliance signal the firm actually needs:
the return type, the return period, and the ARN/reference number. Separately a
filing's status moves through PENDING → IN_REVIEW → FILED → REJECTED with no
audit trail beyond the generic `AuditLog`, so a firm cannot see when or why a
status changed. This increment deepens parsing and records every status
transition as first-class history.

## 2. Scope

In scope:

- Extend the SMS parser with `returnType`, `period`, `arn`, `lateFee`, `filed`.
- Persist those fields on `ParsedGstData` and surface them in the web SMS detail.
- A `FilingStatusEvent` history table; events recorded on filing create, manual
  status change, and automatic SMS reconciliation.
- Automatic reconciliation: a filed acknowledgement SMS (ARN + type + period)
  marks the matching open `GstReturn` (and any linked `Filing`) FILED, recording
  SMS-sourced events.
- History endpoints `GET /v1/filings/:id/history` and
  `GET /v1/returns/:id/history`; web history timeline in the Filings page.

Out of scope: GSTR-2B/IMS, notice workflow, outbound portal sync. Reconciliation
only ever transitions an open return to FILED; it never downgrades or rejects.

## 3. Data Model

`ParsedGstData` gains nullable columns `returnType ReturnType?`, `period String?`
(`YYYY-MM`), `arn String?`, `lateFee Float?`, `filed Boolean?`.

```
enum FilingEventSource { MANUAL SMS SYSTEM }

model FilingStatusEvent {
  id             String            @id @default(cuid())
  filingId       String?
  returnId       String?
  clientId       String
  status         FilingStatus
  previousStatus FilingStatus?
  source         FilingEventSource @default(MANUAL)
  actorId        String?
  actorName      String?
  smsMessageId   String?
  note           String?
  createdAt      DateTime          @default(now())

  filing    Filing?    @relation(fields: [filingId], references: [id], onDelete: Cascade)
  gstReturn GstReturn? @relation(fields: [returnId], references: [id], onDelete: Cascade)
  client    Client     @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@index([filingId, createdAt])
  @@index([returnId, createdAt])
  @@index([clientId, createdAt])
}
```

Events are append-only and survive via `SetNull`/cascade rules aligned to the
owning row. Tenant scoping is enforced by joining through `client.firmId`, same
as every other filing query.

## 4. Parser Rules

- `returnType`: `GSTR-3B` → GSTR3B, `GSTR-1` → GSTR1, `GSTR-9` → GSTR9, any
  other `GSTR` token → OTHER, otherwise null.
- `period`: month name (`Jan 2026`) or labelled `MM-YYYY` (`for 07-2026`) or
  quarter (`Q3 FY2025-26` → FY quarter-end month); normalised to `YYYY-MM`.
- `arn`: labelled ARN/acknowledgement/reference followed by a 15-char token, or a
  generic 15-char ARN-looking token that is not the message's GSTIN.
- `lateFee`: `late fee`/`penalty` followed by a currency number.
- `filed`: true when the text says `filed`/`successfully filed`/`submitted`/
  `accepted`, or when an ARN is present.
- Confidence becomes matched/11 over the expanded field set.

## 5. Reconciliation

On ingest, after parsing, `SmsService` calls
`FilingsService.applyFiledReturnFromSms` when `filed && arn && returnType &&
period`. The service finds the client's `GstReturn` for `(type, period)`. If it
is not already FILED it sets status/reference/filedAt (receivedAt), records a
`FilingStatusEvent` (source SMS, `smsMessageId`, `previousStatus`), and applies
the same to non-filed `Filing` rows bound to that return. Idempotent: an already
FILED return is left untouched.

## 6. API

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/filings/:id/history` | `filings:read` | `FilingStatusEvent[]` |
| GET | `/returns/:id/history` | `returns:read` | `FilingStatusEvent[]` |

Both 404 for a row outside the actor's firm. History is ordered newest-first.

## 7. UI

- Filings page: a `History` toggle beside `Payments` loads and renders the event
  timeline (status, source badge, actor name, note, timestamp).
- SMS detail page: parsed panel shows return type, period, ARN, late fee, filed.
- Mobile is unchanged in this increment.

## 8. Testing

- Unit: parser cases for return type, period (month/label/quarter), ARN, late
  fee, filed signal, and confidence bounds.
- e2e: create filing → history has a MANUAL create event; status change appends
  an event and cascades to the return; a filed acknowledgement SMS marks a
  matching open return FILED with an SMS event; unknown/foreign history → 404.
