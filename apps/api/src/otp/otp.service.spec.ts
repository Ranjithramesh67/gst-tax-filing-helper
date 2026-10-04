import { Prisma } from '@prisma/client';

import type { Actor } from '../common/auth/actor.types';
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

  it('scopes group resolution to the firm as well as the client', async () => {
    const prisma = buildPrisma();
    const service = new OtpService(prisma, buildCrypto());

    await service.recordFromSms(input);

    expect(prisma.otpEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          firmId: 'firm-1',
          clientId: 'client-1',
          code: '123456',
        }),
      }),
    );
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

const emailActor = {
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

const emailItem = {
  code: '4831',
  source: 'EMAIL' as const,
  fromAddress: 'noreply@bank.example',
  subject: 'Your one-time password',
  snippet: 'Your OTP is ••••',
  receivedAt: '2026-10-04T10:00:00.000Z',
  sourceRef: 'email-msg-1',
};

function buildEmailPrisma() {
  const prisma = {
    consentRecord: { findFirst: jest.fn().mockResolvedValue({ id: 'consent-1' }) },
    client: {
      findUnique: jest.fn().mockResolvedValue({ phone: '+919999999999' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'client-1', firmId: 'firm-1' }]),
    },
    device: { findMany: jest.fn().mockResolvedValue([]) },
    systemSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    otpEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'email-1', groupId: null }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  return prisma as unknown as PrismaService & { [key: string]: any };
}

describe('OtpService.recordEmailEvents', () => {
  it('creates an EMAIL event, encrypts the snippet and adopts the new group id', async () => {
    const prisma = buildEmailPrisma();
    const crypto = buildCrypto();
    const service = new OtpService(prisma, crypto);

    const result = await service.recordEmailEvents(emailActor, [emailItem]);

    const createArg = (prisma.otpEvent.create as jest.Mock).mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      firmId: 'firm-1',
      clientId: 'client-1',
      code: '4831',
      source: 'EMAIL',
      fromAddress: 'noreply@bank.example',
      subject: 'Your one-time password',
      snippet: 'enc:Your OTP is ••••',
      sourceRef: 'email-msg-1',
    });
    expect((prisma.otpEvent.update as jest.Mock).mock.calls[0][0]).toMatchObject({
      where: { id: 'email-1' },
      data: { groupId: 'email-1' },
    });
    expect(result).toEqual({ accepted: 1, duplicates: 0, rejected: 0, ids: ['email-1'] });
  });

  it('fans out one event per ACTIVE linked firm', async () => {
    const prisma = buildEmailPrisma();
    (prisma.client.findMany as jest.Mock).mockResolvedValue([
      { id: 'client-1', firmId: 'firm-1' },
      { id: 'client-2', firmId: 'firm-2' },
    ]);
    (prisma.otpEvent.create as jest.Mock)
      .mockResolvedValueOnce({ id: 'email-1', groupId: null })
      .mockResolvedValueOnce({ id: 'email-2', groupId: null });
    const service = new OtpService(prisma, buildCrypto());

    const result = await service.recordEmailEvents(emailActor, [emailItem]);

    expect(prisma.otpEvent.create).toHaveBeenCalledTimes(2);
    expect((prisma.otpEvent.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
      firmId: 'firm-1',
      clientId: 'client-1',
    });
    expect((prisma.otpEvent.create as jest.Mock).mock.calls[1][0].data).toMatchObject({
      firmId: 'firm-2',
      clientId: 'client-2',
    });
    expect(result).toEqual({ accepted: 1, duplicates: 0, rejected: 0, ids: ['email-1', 'email-2'] });
  });

  it('swallows a P2002 unique violation and reports the item as a duplicate', async () => {
    const prisma = buildEmailPrisma();
    (prisma.otpEvent.create as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.20.0',
      }),
    );
    const service = new OtpService(prisma, buildCrypto());

    await expect(service.recordEmailEvents(emailActor, [emailItem])).resolves.toEqual({
      accepted: 0,
      duplicates: 1,
      rejected: 0,
      ids: [],
    });
  });

  it('rejects and does not persist an item whose device is not owned by the client', async () => {
    const prisma = buildEmailPrisma();
    const service = new OtpService(prisma, buildCrypto());

    const result = await service.recordEmailEvents(emailActor, [
      { ...emailItem, deviceId: 'someone-elses-device' },
    ]);

    expect(result).toEqual({ accepted: 0, duplicates: 0, rejected: 1, ids: [] });
    expect(prisma.otpEvent.create).not.toHaveBeenCalled();
  });

  it('attaches a device only to the linked firm that owns it', async () => {
    const prisma = buildEmailPrisma();
    (prisma.client.findMany as jest.Mock).mockResolvedValue([
      { id: 'client-1', firmId: 'firm-1' },
      { id: 'client-2', firmId: 'firm-2' },
    ]);
    (prisma.device.findMany as jest.Mock).mockResolvedValue([
      { id: 'device-1', androidId: 'android-1', clientId: 'client-1' },
    ]);
    (prisma.otpEvent.create as jest.Mock)
      .mockResolvedValueOnce({ id: 'email-1', groupId: null })
      .mockResolvedValueOnce({ id: 'email-2', groupId: null });
    const service = new OtpService(prisma, buildCrypto());

    await service.recordEmailEvents(emailActor, [{ ...emailItem, deviceId: 'device-1' }]);

    expect((prisma.otpEvent.create as jest.Mock).mock.calls[0][0].data.deviceId).toBe('device-1');
    expect((prisma.otpEvent.create as jest.Mock).mock.calls[1][0].data.deviceId).toBeNull();
  });

  it('reuses a previous group when the same code is within the window', async () => {
    const prisma = buildEmailPrisma();
    (prisma.otpEvent.findFirst as jest.Mock).mockResolvedValue({
      groupId: 'group-9',
      receivedAt: new Date('2026-10-04T09:59:30.000Z'),
    });
    (prisma.otpEvent.create as jest.Mock).mockResolvedValue({ id: 'email-2', groupId: 'group-9' });
    const service = new OtpService(prisma, buildCrypto());

    await service.recordEmailEvents(emailActor, [emailItem]);

    expect((prisma.otpEvent.create as jest.Mock).mock.calls[0][0].data.groupId).toBe('group-9');
    expect(prisma.otpEvent.update).not.toHaveBeenCalled();
  });

  it('scopes group resolution by firm as well as client', async () => {
    const prisma = buildEmailPrisma();
    const service = new OtpService(prisma, buildCrypto());

    await service.recordEmailEvents(emailActor, [emailItem]);

    expect(prisma.otpEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          firmId: 'firm-1',
          clientId: 'client-1',
          code: '4831',
        }),
      }),
    );
  });

  it('counts a non-duplicate persistence failure as rejected without failing the batch', async () => {
    const prisma = buildEmailPrisma();
    (prisma.otpEvent.create as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('foreign key', {
        code: 'P2003',
        clientVersion: '5.20.0',
      }),
    );
    const service = new OtpService(prisma, buildCrypto());

    const result = await service.recordEmailEvents(emailActor, [emailItem]);

    expect(result).toEqual({ accepted: 0, duplicates: 0, rejected: 1, ids: [] });
  });

  it('refuses a non-CLIENT actor', async () => {
    const prisma = buildEmailPrisma();
    const service = new OtpService(prisma, buildCrypto());
    const staff = { ...emailActor, role: 'FILER', clientId: null } as unknown as Actor;

    await expect(service.recordEmailEvents(staff, [emailItem])).rejects.toThrow();
    expect(prisma.otpEvent.create).not.toHaveBeenCalled();
  });

  it('requires active consent before persisting', async () => {
    const prisma = buildEmailPrisma();
    (prisma.consentRecord.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new OtpService(prisma, buildCrypto());

    await expect(service.recordEmailEvents(emailActor, [emailItem])).rejects.toThrow();
    expect(prisma.otpEvent.create).not.toHaveBeenCalled();
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

const feedActor = {
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

function otpRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'otp-1',
    groupId: 'group-1',
    clientId: 'client-1',
    deviceId: null,
    code: '4831',
    source: 'SMS',
    fromAddress: null,
    subject: null,
    snippet: 'enc:login OTP ••••',
    receivedAt: new Date('2026-10-04T10:00:00.000Z'),
    sourceRef: 'sms-1',
    createdAt: new Date('2026-10-04T10:00:00.000Z'),
    ...overrides,
  };
}

function smsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sms-1',
    clientId: 'client-1',
    deviceId: null,
    sender: 'AD-GSTIND-S',
    bodyEncrypted: 'enc:Your login OTP is 4831. Do not share.',
    receivedAt: new Date('2026-10-04T10:00:00.000Z'),
    category: 'OTP',
    status: 'RECEIVED',
    hash: 'hash-1',
    createdAt: new Date('2026-10-04T10:00:00.000Z'),
    client: { id: 'client-1', name: 'Acme Traders', gstin: null },
    parsed: null,
    ...overrides,
  };
}

function buildFeedPrisma() {
  const prisma = {
    otpEvent: { findMany: jest.fn().mockResolvedValue([]) },
    smsMessage: { findMany: jest.fn().mockResolvedValue([]) },
    client: {
      findMany: jest.fn().mockResolvedValue([{ id: 'client-1', name: 'Acme Traders' }]),
    },
  };
  return prisma as unknown as PrismaService & { [key: string]: any };
}

describe('OtpService.listFeed', () => {
  it('collapses SMS+EMAIL events of the same code into one OTP item', async () => {
    const prisma = buildFeedPrisma();
    (prisma.otpEvent.findMany as jest.Mock)
      // First call: feed OTP events (newest first). Subsequent call: dedupe refs.
      .mockResolvedValueOnce([
        otpRow({
          id: 'otp-email',
          source: 'EMAIL',
          fromAddress: 'noreply@bank.example',
          subject: 'Your one-time password',
          snippet: 'enc:Your OTP is ••••',
          receivedAt: new Date('2026-10-04T10:00:30.000Z'),
          sourceRef: 'email-1',
        }),
        otpRow({ id: 'otp-sms', receivedAt: new Date('2026-10-04T10:00:00.000Z') }),
      ])
      .mockResolvedValueOnce([{ sourceRef: 'sms-1' }]);
    (prisma.smsMessage.findMany as jest.Mock).mockResolvedValue([smsRow()]);

    const service = new OtpService(prisma, buildCrypto());
    const result = await service.listFeed(feedActor, {});

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.kind).toBe('OTP');
    if (item.kind !== 'OTP') throw new Error('expected OTP item');
    expect(item).toMatchObject({
      id: 'group-1',
      code: '4831',
      sources: ['SMS', 'EMAIL'],
      eventCount: 2,
      client: { id: 'client-1', name: 'Acme Traders' },
      receivedAt: '2026-10-04T10:00:00.000Z',
      latestAt: '2026-10-04T10:00:30.000Z',
    });
    // The raw SMS backing the group is deduped out entirely.
    expect(result.items.some((entry) => entry.kind === 'SMS')).toBe(false);
  });

  it('keeps events with distinct groups (outside the window) as separate items', async () => {
    const prisma = buildFeedPrisma();
    (prisma.otpEvent.findMany as jest.Mock)
      .mockResolvedValueOnce([
        otpRow({
          id: 'otp-late',
          groupId: 'group-late',
          receivedAt: new Date('2026-10-04T10:10:00.000Z'),
          sourceRef: 'sms-late',
        }),
        otpRow({
          id: 'otp-early',
          groupId: 'group-early',
          receivedAt: new Date('2026-10-04T10:00:00.000Z'),
        }),
      ])
      .mockResolvedValueOnce([]);

    const service = new OtpService(prisma, buildCrypto());
    const result = await service.listFeed(feedActor, {});

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.id)).toEqual(['group-late', 'group-early']);
    expect(result.items.every((item) => item.kind === 'OTP')).toBe(true);
  });

  it('still surfaces a non-OTP SMS as a kind:SMS item', async () => {
    const prisma = buildFeedPrisma();
    (prisma.otpEvent.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.smsMessage.findMany as jest.Mock).mockResolvedValue([
      smsRow({ id: 'sms-plain', category: 'TRANSACTIONAL' }),
    ]);

    const service = new OtpService(prisma, buildCrypto());
    const result = await service.listFeed(feedActor, {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ kind: 'SMS', id: 'sms-plain' });
  });

  it('returns the full decrypted SMS body and never exposes ciphertext or hash', async () => {
    const prisma = buildFeedPrisma();
    (prisma.otpEvent.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const longBody = `Invoice ${'x'.repeat(400)} end`;
    (prisma.smsMessage.findMany as jest.Mock).mockResolvedValue([
      smsRow({ id: 'sms-long', bodyEncrypted: `enc:${longBody}` }),
    ]);

    const service = new OtpService(prisma, buildCrypto());
    const result = await service.listFeed(feedActor, {});

    const item = result.items[0];
    expect(item.kind).toBe('SMS');
    if (item.kind !== 'SMS') throw new Error('expected SMS item');
    expect(item.body).toBe(longBody);
    expect(item).not.toHaveProperty('bodyEncrypted');
    expect(item).not.toHaveProperty('hash');
  });

  it('masks the OTP code out of the returned snippet', async () => {
    const prisma = buildFeedPrisma();
    (prisma.otpEvent.findMany as jest.Mock)
      .mockResolvedValueOnce([
        otpRow({ snippet: 'enc:Your code is 4831 now', sourceRef: 'sms-1' }),
      ])
      .mockResolvedValueOnce([{ sourceRef: 'sms-1' }]);
    (prisma.smsMessage.findMany as jest.Mock).mockResolvedValue([]);

    const service = new OtpService(prisma, buildCrypto());
    const result = await service.listFeed(feedActor, {});

    const item = result.items[0];
    if (item.kind !== 'OTP') throw new Error('expected OTP item');
    expect(item.snippet).not.toContain('4831');
  });

  it('returns no rows when the query asks for another client', async () => {
    const prisma = buildFeedPrisma();
    const service = new OtpService(prisma, buildCrypto());

    const result = await service.listFeed(feedActor, { clientId: 'client-2' });

    expect(result).toMatchObject({ items: [], total: 0, page: 1, pageSize: 25 });
    expect(prisma.otpEvent.findMany).not.toHaveBeenCalled();
  });

  it('scopes the OTP query to the actor firm and client', async () => {
    const prisma = buildFeedPrisma();
    const service = new OtpService(prisma, buildCrypto());

    await service.listFeed(feedActor, {});

    expect(prisma.otpEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ firmId: 'firm-1', clientId: 'client-1' }),
        take: 500,
      }),
    );
    expect(prisma.smsMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: 'client-1' }),
        take: 500,
      }),
    );
  });

  it('applies category and search to raw SMS only', async () => {
    const prisma = buildFeedPrisma();
    const service = new OtpService(prisma, buildCrypto());

    await service.listFeed(feedActor, { category: 'OTP', search: 'bank' });

    const smsArg = (prisma.smsMessage.findMany as jest.Mock).mock.calls[0][0];
    expect(smsArg.where).toMatchObject({
      clientId: 'client-1',
      category: 'OTP',
      sender: { contains: 'bank', mode: 'insensitive' },
    });
    const otpArg = (prisma.otpEvent.findMany as jest.Mock).mock.calls[0][0];
    expect(otpArg.where).not.toHaveProperty('category');
  });

  it('applies status to raw SMS only', async () => {
    const prisma = buildFeedPrisma();
    const service = new OtpService(prisma, buildCrypto());

    await service.listFeed(feedActor, { status: 'REVIEWED' });

    const smsArg = (prisma.smsMessage.findMany as jest.Mock).mock.calls[0][0];
    expect(smsArg.where).toMatchObject({ clientId: 'client-1', status: 'REVIEWED' });
    const otpArg = (prisma.otpEvent.findMany as jest.Mock).mock.calls[0][0];
    expect(otpArg.where).not.toHaveProperty('status');
  });

  it('paginates in memory and reports the over-fetched total', async () => {
    const prisma = buildFeedPrisma();
    const rows = Array.from({ length: 30 }, (_, index) =>
      smsRow({
        id: `sms-${index}`,
        receivedAt: new Date(`2026-10-04T10:${String(index).padStart(2, '0')}:00.000Z`),
      }),
    );
    (prisma.otpEvent.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.smsMessage.findMany as jest.Mock).mockResolvedValue(rows);

    const service = new OtpService(prisma, buildCrypto());
    const result = await service.listFeed(feedActor, { page: '2', pageSize: '10' });

    expect(result.total).toBe(30);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(3);
    expect(result.items).toHaveLength(10);
    // Newest-first: page 2 starts at index 10.
    expect(result.items[0].id).toBe('sms-19');
  });

  it('refuses a non-CLIENT actor', async () => {
    const prisma = buildFeedPrisma();
    const service = new OtpService(prisma, buildCrypto());
    const staff = { ...feedActor, role: 'FILER', clientId: null } as unknown as Actor;

    await expect(service.listFeed(staff, {})).rejects.toThrow();
    expect(prisma.otpEvent.findMany).not.toHaveBeenCalled();
  });
});

function buildGroupPrisma() {
  const prisma = {
    otpEvent: { findMany: jest.fn().mockResolvedValue([]) },
    client: {
      findUnique: jest.fn().mockResolvedValue({ id: 'client-1', name: 'Acme Traders' }),
    },
  };
  return prisma as unknown as PrismaService & { [key: string]: any };
}

describe('OtpService.getGroup', () => {
  it('returns the group events oldest-first with code-masked snippets', async () => {
    const prisma = buildGroupPrisma();
    (prisma.otpEvent.findMany as jest.Mock).mockResolvedValue([
      otpRow({
        id: 'otp-sms',
        groupId: 'group-1',
        source: 'SMS',
        snippet: 'enc:Your OTP is 4831 now',
        receivedAt: new Date('2026-10-04T10:00:00.000Z'),
      }),
      otpRow({
        id: 'otp-email',
        groupId: 'group-1',
        source: 'EMAIL',
        fromAddress: 'noreply@bank.example',
        subject: 'Your one-time password',
        snippet: 'enc:Your OTP is 4831',
        receivedAt: new Date('2026-10-04T10:00:30.000Z'),
      }),
    ]);
    const service = new OtpService(prisma, buildCrypto());

    const detail = await service.getGroup(feedActor, 'group-1');

    expect(detail).toMatchObject({
      id: 'group-1',
      code: '4831',
      client: { id: 'client-1', name: 'Acme Traders' },
    });
    expect(detail.events.map((event) => event.source)).toEqual(['SMS', 'EMAIL']);
    expect(detail.events[0].snippet).not.toContain('4831');
    expect(detail.events[1].snippet).not.toContain('4831');
    expect(detail.events[1]).toMatchObject({ from: 'noreply@bank.example' });
  });

  it('scopes the lookup to the actor firm and client', async () => {
    const prisma = buildGroupPrisma();
    (prisma.otpEvent.findMany as jest.Mock).mockResolvedValue([otpRow()]);
    const service = new OtpService(prisma, buildCrypto());

    await service.getGroup(feedActor, 'group-1');

    expect(prisma.otpEvent.findMany).toHaveBeenCalledWith({
      where: {
        firmId: 'firm-1',
        clientId: 'client-1',
        OR: [{ id: 'group-1' }, { groupId: 'group-1' }],
      },
      orderBy: { receivedAt: 'asc' },
    });
  });

  it('throws NotFound when the group is not visible to the actor', async () => {
    const prisma = buildGroupPrisma();
    const service = new OtpService(prisma, buildCrypto());

    await expect(service.getGroup(feedActor, 'group-x')).rejects.toThrow();
  });

  it('refuses a non-CLIENT actor', async () => {
    const prisma = buildGroupPrisma();
    const service = new OtpService(prisma, buildCrypto());
    const staff = { ...feedActor, role: 'FILER', clientId: null } as unknown as Actor;

    await expect(service.getGroup(staff, 'group-1')).rejects.toThrow();
    expect(prisma.otpEvent.findMany).not.toHaveBeenCalled();
  });
});
