import { OtpSettingsService } from './otp-settings.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../common/auth/actor.types';

function buildPrisma() {
  const prisma = {
    systemSetting: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  return prisma as unknown as PrismaService & { [key: string]: any };
}

function buildAudit() {
  return { recordAs: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
}

const actor: Actor = { userId: 'u1', firmId: null, role: 'SUPER_ADMIN' } as Actor;

describe('OtpSettingsService', () => {
  it('returns the defaults when nothing is stored', async () => {
    const service = new OtpSettingsService(buildPrisma(), buildAudit());
    await expect(service.getConfig()).resolves.toEqual({
      groupWindowSeconds: 300,
      emailEnabled: true,
      providersEnabled: { imap: true, gmail: true, graph: true },
      updatedAt: null,
    });
  });

  it('merges stored values over the defaults', async () => {
    const prisma = buildPrisma();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue({
      value: {
        groupWindowSeconds: 120,
        emailEnabled: false,
        providersEnabled: { imap: false, gmail: true, graph: false },
      },
      updatedAt: new Date('2026-10-04T00:00:00.000Z'),
    });
    const service = new OtpSettingsService(prisma, buildAudit());
    await expect(service.getConfig()).resolves.toEqual({
      groupWindowSeconds: 120,
      emailEnabled: false,
      providersEnabled: { imap: false, gmail: true, graph: false },
      updatedAt: '2026-10-04T00:00:00.000Z',
    });
  });

  it('fills missing provider keys and window from defaults on read', async () => {
    const prisma = buildPrisma();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue({
      value: { providersEnabled: { gmail: false } },
      updatedAt: null,
    });
    const service = new OtpSettingsService(prisma, buildAudit());
    await expect(service.getConfig()).resolves.toEqual({
      groupWindowSeconds: 300,
      emailEnabled: true,
      providersEnabled: { imap: true, gmail: false, graph: true },
      updatedAt: null,
    });
  });

  it('clamps an out-of-range stored window (low, high, non-numeric, fractional)', async () => {
    const cases: Array<[unknown, number]> = [
      [5, 30],
      [100_000, 3600],
      ['nonsense', 300],
      [120.9, 120],
    ];
    for (const [stored, expected] of cases) {
      const prisma = buildPrisma();
      (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue({
        value: { groupWindowSeconds: stored },
        updatedAt: null,
      });
      const service = new OtpSettingsService(prisma, buildAudit());
      await expect(service.getConfig()).resolves.toMatchObject({
        groupWindowSeconds: expected,
      });
    }
  });

  it('clamps and normalises on update before persisting', async () => {
    const prisma = buildPrisma();
    const audit = buildAudit();
    const service = new OtpSettingsService(prisma, audit);

    await service.updateConfig(
      {
        groupWindowSeconds: 10,
        emailEnabled: false,
        providersEnabled: { imap: false, gmail: true, graph: false },
      },
      actor,
    );

    const stored = (prisma.systemSetting.upsert as jest.Mock).mock.calls[0][0].create.value;
    expect(stored).toEqual({
      groupWindowSeconds: 30,
      emailEnabled: false,
      providersEnabled: { imap: false, gmail: true, graph: false },
    });
    expect(audit.recordAs).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'settings.otp.update' }),
    );
  });
});
