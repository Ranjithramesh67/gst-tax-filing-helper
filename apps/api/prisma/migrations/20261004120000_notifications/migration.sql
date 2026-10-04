-- Deadline reminders & in-app notifications.
-- Append-only feed scoped by firmId / userId / clientId; no foreign keys so
-- notifications survive deletion of the referenced row.

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT,
    "clientId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "meta" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_firmId_dedupeKey_key" ON "Notification"("firmId", "dedupeKey");
CREATE INDEX "Notification_firmId_readAt_idx" ON "Notification"("firmId", "readAt");
CREATE INDEX "Notification_clientId_readAt_idx" ON "Notification"("clientId", "readAt");
