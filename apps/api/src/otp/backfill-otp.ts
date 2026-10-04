import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { extractOtp } from '@gstflow/otp';

import { CryptoService } from '../common/crypto/crypto.service';
import type { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';

export interface OtpBackfillResult {
  scanned: number;
  extracted: number;
  inserted: number;
  skipped: number;
  failed: number;
}

/**
 * Mines OTPs out of previously stored SMS messages that predate OTP capture.
 *
 * Idempotent: any `SmsMessage` already represented by an `OtpEvent`
 * (matched on `sourceRef = SmsMessage.id`) is skipped, and `recordFromSms`
 * swallows the unique-key collision if two runs overlap. Safe to re-run.
 */
export async function runOtpBackfill(
  prisma: PrismaClient,
  otp: OtpService,
  crypto: CryptoService,
  logger: Pick<Console, 'log' | 'warn'> = console,
): Promise<OtpBackfillResult> {
  const result: OtpBackfillResult = {
    scanned: 0,
    extracted: 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
  };

  const messages = await prisma.smsMessage.findMany({
    select: {
      id: true,
      clientId: true,
      deviceId: true,
      bodyEncrypted: true,
      receivedAt: true,
      client: { select: { firmId: true } },
    },
    orderBy: { receivedAt: 'asc' },
  });
  result.scanned = messages.length;

  const alreadyCaptured = await prisma.otpEvent.findMany({
    where: { source: 'SMS', sourceRef: { not: null } },
    select: { sourceRef: true },
  });
  const capturedIds = new Set(alreadyCaptured.map((row) => row.sourceRef));

  const windowSeconds = await otp.groupWindowSeconds();
  logger.log(
    `OTP backfill: ${result.scanned} SMS to scan, ${capturedIds.size} already captured (window ${windowSeconds}s)`,
  );

  for (const message of messages) {
    if (capturedIds.has(message.id)) {
      result.skipped += 1;
      continue;
    }

    const body = crypto.decrypt(message.bodyEncrypted);
    const extracted = extractOtp(body);
    if (!extracted) continue;
    result.extracted += 1;

    try {
      await otp.recordFromSms({
        firmId: message.client.firmId,
        clientId: message.clientId,
        deviceId: message.deviceId,
        code: extracted.code,
        snippet: extracted.snippet,
        receivedAt: message.receivedAt,
        sourceRef: message.id,
      });
      result.inserted += 1;
    } catch (error) {
      result.failed += 1;
      logger.warn(`OTP backfill failed for SMS ${message.id}: ${String(error)}`);
    }
  }

  return result;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const crypto = new CryptoService(new ConfigService());
  const otp = new OtpService(prisma as unknown as PrismaService, crypto);
  try {
    const result = await runOtpBackfill(prisma, otp, crypto);
    console.log(`OTP backfill complete: ${JSON.stringify(result)}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`OTP backfill failed: ${String(error)}`);
    process.exitCode = 1;
  });
}
