import { Prisma } from '@prisma/client';

import type { CryptoService } from '../common/crypto/crypto.service';
import type { PrismaService } from '../prisma/prisma.service';
import { runOtpBackfill } from './backfill-otp';
import { groupKeyFor, OtpService } from './otp.service';

describe('groupKeyFor', () => {
  const base = new Date('2026-10-04T10:00:00.000Z');
  it('reuses a group when the same code is inside the window', () => {
    const prev = { id: 'g1', receivedAt: base };
    expect(groupKeyFor(prev, new Date(base.getTime() + 60_000), 300)).toBe('g1');
  });
  it('starts a new group outside the window', () => {
    const prev = { id: 'g1', receivedAt: base };
    expect(groupKeyFor(prev, new Date(base.getTime() + 600_000), 300)).toBeNull();
  });
  it('starts a new group when there is no previous event', () => {
    expect(groupKeyFor(null, base, 300)).toBeNull();
  });
});

function buildPrisma() {
  const prisma = {
    systemSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    otpEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'event-1', groupId: null }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  return prisma as unknown as PrismaService & { [key: string]: any };
}

function buildCrypto() {
  return {
    encrypt: jest.fn((value: string) => `enc:${value}`),
    decrypt: jest.fn((value: string) => value.replace(/^enc:/, '')),
  } as unknown as CryptoService;
}

const input = {
  firmId: 'firm-1',
  clientId: 'client-1',
  deviceId: null,
  code: '123456',
  snippet: 'Your OTP is ••••••',
  receivedAt: new Date('2026-10-04T10:00:00.000Z'),
  sourceRef: 'sms-1',
};

describe('OtpService', () => {
  it('defaults the group window to 300 seconds when nothing is stored', async () => {
    const service = new OtpService(buildPrisma(), buildCrypto());
    await expect(service.groupWindowSeconds()).resolves.toBe(300);
  });

  it('reads groupWindowSeconds from the otp.settings SystemSetting', async () => {
    const prisma = buildPrisma();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue({
      value: { groupWindowSeconds: 120 },
    });
    const service = new OtpService(prisma, buildCrypto());
    await expect(service.groupWindowSeconds()).resolves.toBe(120);
  });

  it('starts a new group by adopting the created event id when nothing precedes it', async () => {
    const prisma = buildPrisma();
    const crypto = buildCrypto();
    const service = new OtpService(prisma, crypto);

    await service.recordFromSms(input);

    const createArg = (prisma.otpEvent.create as jest.Mock).mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      firmId: 'firm-1',
      clientId: 'client-1',
      code: '123456',
      source: 'SMS',
      sourceRef: 'sms-1',
      snippet: 'enc:Your OTP is ••••••',
    });
    expect((prisma.otpEvent.update as jest.Mock).mock.calls[0][0]).toMatchObject({
      where: { id: 'event-1' },
      data: { groupId: 'event-1' },
    });
  });

  it('reuses a previous group when the same code is within the window', async () => {
    const prisma = buildPrisma();
    (prisma.otpEvent.findFirst as jest.Mock).mockResolvedValue({
      groupId: 'group-9',
      receivedAt: new Date('2026-10-04T09:59:30.000Z'),
    });
    (prisma.otpEvent.create as jest.Mock).mockResolvedValue({ id: 'event-2', groupId: 'group-9' });
    const service = new OtpService(prisma, buildCrypto());

    await service.recordFromSms(input);

    const createArg = (prisma.otpEvent.create as jest.Mock).mock.calls[0][0];
    expect(createArg.data.groupId).toBe('group-9');
    expect(prisma.otpEvent.update).not.toHaveBeenCalled();
  });

  it('swallows a P2002 unique violation as a duplicate', async () => {
    const prisma = buildPrisma();
    (prisma.otpEvent.create as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.20.0',
      }),
    );
    const service = new OtpService(prisma, buildCrypto());
    await expect(service.recordFromSms(input)).resolves.toBeUndefined();
  });

  it('rethrows non-duplicate prisma errors', async () => {
    const prisma = buildPrisma();
    (prisma.otpEvent.create as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('foreign key', {
        code: 'P2003',
        clientVersion: '5.20.0',
      }),
    );
    const service = new OtpService(prisma, buildCrypto());
    await expect(service.recordFromSms(input)).rejects.toThrow();
  });

  it('decrypts a stored snippet for reads and passes null through', () => {
    const service = new OtpService(buildPrisma(), buildCrypto());
    expect(service.decryptSnippet('enc:abc')).toBe('abc');
    expect(service.decryptSnippet(null)).toBeNull();
  });
});

describe('runOtpBackfill', () => {
  function buildBackfillPrisma() {
    return {
      smsMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sms-1',
            clientId: 'client-1',
            deviceId: null,
            bodyEncrypted: 'enc:Your OTP is 111111 now',
            receivedAt: input.receivedAt,
            client: { firmId: 'firm-1' },
          },
          {
            id: 'sms-2',
            clientId: 'client-1',
            deviceId: null,
            bodyEncrypted: 'enc:Your OTP is 222222 now',
            receivedAt: input.receivedAt,
            client: { firmId: 'firm-1' },
          },
          {
            id: 'sms-3',
            clientId: 'client-1',
            deviceId: null,
            bodyEncrypted: 'enc:Your order has shipped',
            receivedAt: input.receivedAt,
            client: { firmId: 'firm-1' },
          },
        ]),
      },
      otpEvent: { findMany: jest.fn().mockResolvedValue([{ sourceRef: 'sms-1' }]) },
    };
  }

  it('skips already-captured SMS and inserts newly extracted OTPs idempotently', async () => {
    const prisma = buildBackfillPrisma();
    const crypto = buildCrypto();
    const otp = {
      groupWindowSeconds: jest.fn().mockResolvedValue(300),
      recordFromSms: jest.fn().mockResolvedValue(undefined),
    };
    const logger = { log: jest.fn(), warn: jest.fn() };

    const result = await runOtpBackfill(
      prisma as unknown as Parameters<typeof runOtpBackfill>[0],
      otp as unknown as OtpService,
      crypto,
      logger,
    );

    expect(result).toEqual({ scanned: 3, extracted: 1, inserted: 1, skipped: 1, failed: 0 });
    expect(otp.recordFromSms).toHaveBeenCalledTimes(1);
    expect(otp.recordFromSms).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRef: 'sms-2', code: '222222', firmId: 'firm-1' }),
    );
  });
});
