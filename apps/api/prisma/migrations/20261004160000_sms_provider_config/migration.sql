-- CreateEnum
CREATE TYPE "SmsProviderKind" AS ENUM ('PING4SMS');

-- CreateTable
CREATE TABLE "SmsProviderConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "SmsProviderKind" NOT NULL DEFAULT 'PING4SMS',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "sender" TEXT NOT NULL,
    "route" TEXT,
    "templateId" TEXT,
    "header" TEXT,
    "credentials" TEXT NOT NULL,
    "messageTemplate" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "variables" JSONB,
    "timeoutMs" INTEGER NOT NULL DEFAULT 8000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SmsProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsProviderConfig_isActive_idx" ON "SmsProviderConfig"("isActive");
