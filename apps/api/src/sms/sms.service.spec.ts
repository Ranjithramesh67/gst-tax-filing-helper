import { createHash } from 'crypto';

import type { Actor } from '../common/auth/actor.types';
import type { AuditService } from '../common/audit/audit.service';
import type { CryptoService } from '../common/crypto/crypto.service';
import type { FilingsService } from '../filings/filings.service';
import type { OtpService } from '../otp/otp.service';
import type { PrismaService } from '../prisma/prisma.service';
import { canonicalSmsHash, SmsService } from './sms.service';

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('canonicalSmsHash', () => {
  const sender = 'AD-GSTIND-S';
  const body = 'One Time Password is 123456. GSTN';

  it('collides for the same message captured at different sub-second precision', () => {
    const fromBroadcast = new Date('2026-10-04T13:40:14.697Z');
    const fromInbox = new Date('2026-10-04T13:40:14.000Z');
    expect(canonicalSmsHash(hash, sender, body, fromBroadcast)).toBe(
      canonicalSmsHash(hash, sender, body, fromInbox),
    );
  });

  it('distinguishes messages on different seconds', () => {
    const first = new Date('2026-10-04T13:40:14.697Z');
    const second = new Date('2026-10-04T13:40:15.697Z');
    expect(canonicalSmsHash(hash, sender, body, first)).not.toBe(
      canonicalSmsHash(hash, sender, body, second),
    );
  });

  it('distinguishes different bodies and senders', () => {
    const at = new Date('2026-10-04T13:40:14.697Z');
    const base = canonicalSmsHash(hash, sender, body, at);
    expect(canonicalSmsHash(hash, sender, `${body} `, at)).not.toBe(base);
    expect(canonicalSmsHash(hash, 'AX-GSTIND-S', body, at)).not.toBe(base);
  });
});

function buildIngestPrisma() {
  const prisma = {
    consentRecord: { findFirst: jest.fn().mockResolvedValue({ id: 'consent-1' }) },
    client: {
      findUnique: jest.fn().mockResolvedValue({ phone: '+919999999999' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'client-1', firmId: 'firm-1' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    device: { findMany: jest.fn().mockResolvedValue([]) },
    smsMessage: { create: jest.fn().mockResolvedValue({ id: 'sms-1' }) },
    parsedGstData: { create: jest.fn().mockResolvedValue({}) },
  };
  return prisma as unknown as PrismaService & { [key: string]: any };
}

function buildCrypto() {
  return {
    encrypt: jest.fn((value: string) => `enc:${value}`),
    decrypt: jest.fn((value: string) => value.replace(/^enc:/, '')),
    hash: jest.fn((value: string) => `hash:${value}`),
  } as unknown as CryptoService;
}

const actor = {
  userId: 'u1',
  role: 'CLIENT',
  roleId: null,
  roleKey: 'CLIENT',
  roleName: null,
  isSuperAdmin: false,
  permissions: [],
  firmId: 'firm-1',
  clientId: 'client-1',
} as unknown as Actor;

describe('SmsService.ingest', () => {
  // OTP keyword up front, then enough filler to push the GST content outside
  // extractOtp's 160-char noise window — so this is both an OTP SMS and a filed
  // return in one body.
  const filler =
    'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ';
  const filedWithOtp = `Your OTP is 123456. ${filler}${filler}GSTR3B return filed successfully for period 01/2026 ARN AA1234567890123.`;

  function buildService(overrides: {
    otpRecord?: jest.Mock;
    applyFiled?: jest.Mock;
  } = {}) {
    const prisma = buildIngestPrisma();
    const crypto = buildCrypto();
    const audit = { recordAs: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const filings = {
      applyFiledReturnFromSms:
        overrides.applyFiled ?? jest.fn().mockResolvedValue(undefined),
    } as unknown as FilingsService;
    const otp = {
      recordFromSms: overrides.otpRecord ?? jest.fn().mockResolvedValue(undefined),
    } as unknown as OtpService;
    const service = new SmsService(prisma, crypto, audit, filings, otp);
    return { service, prisma, filings, otp };
  }

  it('still ingests and reconciles the filing when OTP recording fails', async () => {
    const otpRecord = jest.fn().mockRejectedValue(new Error('otp backend down'));
    const applyFiled = jest.fn().mockResolvedValue(undefined);
    const { service, filings, otp } = buildService({ otpRecord, applyFiled });

    const result = await service.ingest(actor, {
      items: [{ sender: 'AD-GSTIND', body: filedWithOtp, receivedAt: '2026-10-04T10:00:00.000Z', hash: 'h1' }],
    });

    expect(otp.recordFromSms).toHaveBeenCalledTimes(1);
    expect(filings.applyFiledReturnFromSms).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ accepted: 1, duplicates: 0, rejected: 0, ids: ['sms-1'] });
  });
});
