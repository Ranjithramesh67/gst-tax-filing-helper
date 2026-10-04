-- CreateEnum
CREATE TYPE "OtpSource" AS ENUM ('SMS', 'EMAIL');

-- CreateTable
CREATE TABLE "OtpEvent" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deviceId" TEXT,
    "code" TEXT NOT NULL,
    "source" "OtpSource" NOT NULL,
    "fromAddress" TEXT,
    "subject" TEXT,
    "snippet" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "sourceRef" TEXT,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpEvent_firmId_receivedAt_idx" ON "OtpEvent"("firmId", "receivedAt");

-- CreateIndex
CREATE INDEX "OtpEvent_clientId_code_receivedAt_idx" ON "OtpEvent"("clientId", "code", "receivedAt");

-- CreateIndex
CREATE INDEX "OtpEvent_groupId_idx" ON "OtpEvent"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "OtpEvent_clientId_source_sourceRef_key" ON "OtpEvent"("clientId", "source", "sourceRef");
