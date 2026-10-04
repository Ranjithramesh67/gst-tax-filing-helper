import { RetentionService } from './retention.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../common/auth/actor.types';

function buildPrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    systemSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    smsMessage: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    smsMessageArchive: {
      count: jest.fn().mockResolvedValue(0),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn().mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg as Promise<unknown>[]) : (arg as () => unknown)(),
    ),
    ...overrides,
  };
  return prisma as unknown as PrismaService & { [key: string]: any };
}

function buildAudit() {
  return { recordAs: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
}

const actor: Actor = { userId: 'u1', firmId: null, role: 'SUPER_ADMIN' } as Actor;

describe('RetentionService', () => {
  beforeEach(() => {
    process.env.RETENTION_ENABLED = 'false';
  });

  it('returns defaults when no policy is stored', async () => {
    const service = new RetentionService(buildPrisma(), buildAudit());
    await expect(service.getPolicy()).resolves.toEqual({
      enabled: false,
      archiveAfterDays: 180,
      purgeBackupAfterDays: 365,
      updatedAt: null,
    });
  });

  it('returns stored policy values', async () => {
    const prisma = buildPrisma();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue({
      value: { enabled: true, archiveAfterDays: 30, purgeBackupAfterDays: 90 },
      updatedAt: new Date('2026-10-04T00:00:00.000Z'),
    });
    const service = new RetentionService(prisma, buildAudit());
    await expect(service.getPolicy()).resolves.toEqual({
      enabled: true,
      archiveAfterDays: 30,
      purgeBackupAfterDays: 90,
      updatedAt: '2026-10-04T00:00:00.000Z',
    });
  });

  it('persists and audits policy updates', async () => {
    const prisma = buildPrisma();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue({
      value: { enabled: true, archiveAfterDays: 45, purgeBackupAfterDays: 120 },
      updatedAt: new Date('2026-10-04T10:00:00.000Z'),
    });
    const audit = buildAudit();
    const service = new RetentionService(prisma, audit);

    const result = await service.updatePolicy(
      { enabled: true, archiveAfterDays: 45, purgeBackupAfterDays: 120 },
      actor,
    );
    expect(prisma.systemSetting.upsert).toHaveBeenCalledTimes(1);
    expect(audit.recordAs).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'settings.smsRetention.update' }),
    );
    expect(result.archiveAfterDays).toBe(45);
  });

  it('skips work when disabled and not forced', async () => {
    const prisma = buildPrisma();
    const service = new RetentionService(prisma, buildAudit());
    await expect(service.run(actor, false)).resolves.toEqual({
      archived: 0,
      purged: 0,
      policy: expect.objectContaining({ enabled: false }),
    });
    expect(prisma.smsMessage.findMany).not.toHaveBeenCalled();
  });

  it('archives old messages and purges expired backups when forced', async () => {
    const prisma = buildPrisma();
    const row = {
      id: 'm1',
      clientId: 'c1',
      deviceId: 'd1',
      sender: 'AD-GSTN',
      bodyEncrypted: 'enc',
      receivedAt: new Date('2020-01-01T00:00:00.000Z'),
      category: 'GST',
      status: 'PENDING',
      hash: 'h1',
      parsed: null,
    };
    (prisma.smsMessage.findMany as jest.Mock).mockResolvedValue([row]);
    (prisma.smsMessageArchive.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    const audit = buildAudit();
    const service = new RetentionService(prisma, audit);

    const result = await service.run(actor, true);
    expect(result.archived).toBe(1);
    expect(result.purged).toBe(2);
    expect(prisma.smsMessageArchive.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.smsMessage.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1'] } },
    });
    expect(audit.recordAs).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'settings.smsRetention.run' }),
    );
  });

  it('runs automatically when enabled', async () => {
    const prisma = buildPrisma();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue({
      value: { enabled: true, archiveAfterDays: 10, purgeBackupAfterDays: 30 },
    });
    const service = new RetentionService(prisma, buildAudit());
    await service.run(null, false);
    expect(prisma.smsMessage.findMany).toHaveBeenCalled();
  });

  it('reports preview counts', async () => {
    const prisma = buildPrisma();
    (prisma.smsMessage.count as jest.Mock)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(4);
    (prisma.smsMessageArchive.count as jest.Mock)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(1);
    const service = new RetentionService(prisma, buildAudit());

    await expect(service.preview()).resolves.toEqual({
      liveCount: 12,
      archiveCandidates: 4,
      archivedCount: 7,
      purgeCandidates: 1,
      policy: expect.objectContaining({ enabled: false }),
    });
  });
});
