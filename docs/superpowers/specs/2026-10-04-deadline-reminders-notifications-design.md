# Deadline Reminders & Notifications — Design Spec

Date: 2026-10-04
Status: Approved
Depends on: GSTFlow design (2026-09-30), Firm settings (2026-10-04)

## 1. Problem

The Deadlines page is read-only. Nothing tells a firm when a GST return is about
to be due or overdue unless someone opens the page, and there is no in-app way to
inform a party. This adds a persisted notification feed plus a reminder generator
that turns open return due dates into actionable notifications.

## 2. Scope

In scope:

- A `Notification` table (firm-wide or addressed to a user/party).
- A reminder generator that scans open `GstReturn` rows and creates one
  notification per due-date bucket, deduplicated.
- Notification read API + unread count, for staff and party (client) actors.
- An in-app feed in the firm portal (header bell + `/notifications` page) and a
  Notifications screen in the mobile app.
- Optional outbound delivery via a generic webhook (`NOTIFY_WEBHOOK_URL`).

Out of scope: email/WhatsApp credentials, push (FCM) delivery, per-user
subscription preferences. Delivery stays enabled only when an operator configures
a webhook.

## 3. Data Model

```
Notification
  id         String    @id @default(cuid())
  firmId     String
  userId     String?   // null = firm-wide (visible to all staff)
  clientId   String?   // party recipient, for future party-facing notices
  type       String    // RETURN_DUE_7D | RETURN_DUE_3D | RETURN_DUE_1D | RETURN_OVERDUE | ...
  title      String
  body       String
  entity     String?
  entityId   String?
  meta       Json?
  dedupeKey  String
  readAt     DateTime?
  createdAt  DateTime  @default(now())

  @@unique([firmId, dedupeKey])
  @@index([firmId, readAt])
  @@index([clientId, readAt])
```

No foreign keys: notifications are an append-only feed and must survive the
deletion of the referenced row. Scoping is by `firmId` / `userId` / `clientId`.

## 4. Reminder Generation

`RemindersService` runs on module init and then every `REMINDER_INTERVAL_MS`
(default 6h). For every open return (`status != FILED`, `dueDate != null`) it
computes days until due and a bucket:

| days until due | type |
|---|---|
| `< 0` | `RETURN_OVERDUE` |
| `0..1` | `RETURN_DUE_1D` |
| `2..3` | `RETURN_DUE_3D` |
| `4..7` | `RETURN_DUE_7D` |

`dedupeKey = "${returnId}:${type}"`; rows are inserted with
`createMany({ skipDuplicates: true })` so a return notifies each bucket once.
When `NOTIFY_WEBHOOK_URL` is set, each created notification is POSTed there
(best-effort, failures logged, never block generation).

A super admin can trigger a run via `POST /v1/reminders/run` for operations and
tests.

## 5. API Surface

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/notifications` | any bearer | query `unreadOnly?`, `page?`, `pageSize?`; scoped: staff → `firmId` + (`userId=null` or self); client → `clientId` |
| GET | `/notifications/unread-count` | any bearer | `{ count }` |
| POST | `/notifications/:id/read` | any bearer | marks one readable notification read (404 if out of scope) |
| POST | `/notifications/read-all` | any bearer | `{ updated }` |
| POST | `/reminders/run` | `SUPER_ADMIN` | `{ created }` |

## 6. Surfaces

- `packages/types`: `Notification`, `PaginatedNotifications`, `NotificationsQuery`.
- `packages/validation`: `listNotificationsQuerySchema`.
- `packages/api-client`: `notifications.list/unreadCount/markRead/markAllRead`,
  `reminders.run`.
- `apps/web`: header bell with unread count (refresh on interval) and a
  `/notifications` page.
- `apps/mobile`: a Notifications screen reachable from Home that lists the party's
  notifications and marks them read.

## 7. Testing

`apps/api/test/notifications.e2e-spec.ts`:

- create a return due in 3 days, run reminders → a `RETURN_DUE_3D` notification
  appears for the firm with `unread-count > 0`
- running reminders again does not duplicate the notification
- an overdue return yields `RETURN_OVERDUE`
- mark-read clears unread; mark-all clears the rest
- a party token sees no firm notifications; a staff token sees firm-wide rows
