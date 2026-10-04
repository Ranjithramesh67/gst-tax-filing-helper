-- Deeper SMS parsing fields on ParsedGstData + append-only filing status history.
-- Events survive filing/return deletion via FK cascade; clientId is the tenant key.

ALTER TABLE "ParsedGstData"
    ADD COLUMN "returnType" "ReturnType",
    ADD COLUMN "period" TEXT,
    ADD COLUMN "arn" TEXT,
    ADD COLUMN "lateFee" DOUBLE PRECISION,
    ADD COLUMN "filed" BOOLEAN;

CREATE TYPE "FilingEventSource" AS ENUM ('MANUAL', 'SMS', 'SYSTEM');

CREATE TABLE "FilingStatusEvent" (
    "id" TEXT NOT NULL,
    "filingId" TEXT,
    "returnId" TEXT,
    "clientId" TEXT NOT NULL,
    "status" "FilingStatus" NOT NULL,
    "previousStatus" "FilingStatus",
    "source" "FilingEventSource" NOT NULL DEFAULT 'MANUAL',
    "actorId" TEXT,
    "actorName" TEXT,
    "smsMessageId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilingStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FilingStatusEvent_filingId_createdAt_idx" ON "FilingStatusEvent"("filingId", "createdAt");
CREATE INDEX "FilingStatusEvent_returnId_createdAt_idx" ON "FilingStatusEvent"("returnId", "createdAt");
CREATE INDEX "FilingStatusEvent_clientId_createdAt_idx" ON "FilingStatusEvent"("clientId", "createdAt");

ALTER TABLE "FilingStatusEvent"
    ADD CONSTRAINT "FilingStatusEvent_filingId_fkey"
    FOREIGN KEY ("filingId") REFERENCES "Filing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FilingStatusEvent"
    ADD CONSTRAINT "FilingStatusEvent_returnId_fkey"
    FOREIGN KEY ("returnId") REFERENCES "GstReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FilingStatusEvent"
    ADD CONSTRAINT "FilingStatusEvent_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
