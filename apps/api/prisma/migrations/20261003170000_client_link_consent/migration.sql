-- Mutual-consent linking between firms and parties (clients).
-- A firm adds a party by mobile number; the party must confirm from the mobile
-- app before any data (e.g. GST SMS) is shared. Existing and seeded clients are
-- backfilled as ACTIVE so the feature is opt-in for newly added parties only.

CREATE TYPE "LinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'REVOKED');

ALTER TABLE "Client"
    ADD COLUMN "linkStatus" "LinkStatus" NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN "linkRequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "linkConfirmedAt" TIMESTAMP(3),
    ADD COLUMN "linkRejectedAt" TIMESTAMP(3),
    ADD COLUMN "linkRevokedAt" TIMESTAMP(3),
    ADD COLUMN "linkNote" TEXT;

CREATE INDEX "Client_linkStatus_idx" ON "Client"("linkStatus");
