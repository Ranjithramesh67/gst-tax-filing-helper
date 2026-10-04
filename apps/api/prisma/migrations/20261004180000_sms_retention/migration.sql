-- CreateTable
CREATE TABLE "SmsMessageArchive" (
    "id" TEXT NOT NULL,
    "originalId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deviceId" TEXT,
    "sender" TEXT NOT NULL,
    "bodyEncrypted" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "category" "SmsCategory" NOT NULL DEFAULT 'UNCLASSIFIED',
    "status" "SmsStatus" NOT NULL DEFAULT 'RECEIVED',
    "hash" TEXT NOT NULL,
    "parsed" JSONB,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsMessageArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SmsMessageArchive_purgeAt_idx" ON "SmsMessageArchive"("purgeAt");

-- CreateIndex
CREATE INDEX "SmsMessageArchive_clientId_receivedAt_idx" ON "SmsMessageArchive"("clientId", "receivedAt");

-- CreateIndex
CREATE INDEX "SmsMessageArchive_originalId_idx" ON "SmsMessageArchive"("originalId");

-- CreateIndex
CREATE INDEX "SystemSetting_updatedAt_idx" ON "SystemSetting"("updatedAt");
