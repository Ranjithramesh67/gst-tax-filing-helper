import { SmsKeywordService } from './sms-keyword.service';
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

describe('SmsKeywordService', () => {
  it('returns the legacy default (body contains gst) when nothing is stored', async () => {
    const service = new SmsKeywordService(buildPrisma(), buildAudit());
    await expect(service.getConfig()).resolves.toEqual({
      bodyKeywords: ['gst'],
      headerKeywords: [],
      hideAfterForward: false,
      updatedAt: null,
    });
  });

  it('returns stored keywords', async () => {
    const prisma = buildPrisma();
    (prisma.systemSetting.findUnique as jest.Mock).mockResolvedValue({
      value: { bodyKeywords: ['gstin', 'arn'], headerKeywords: ['GSTN'], hideAfterForward: true },
      updatedAt: new Date('2026-10-04T00:00:00.000Z'),
    });
    const service = new SmsKeywordService(prisma, buildAudit());
    await expect(service.getConfig()).resolves.toEqual({
      bodyKeywords: ['gstin', 'arn'],
      headerKeywords: ['GSTN'],
      hideAfterForward: true,
      updatedAt: '2026-10-04T00:00:00.000Z',
    });
  });

  it('trims, drops blanks and de-duplicates case-insensitively on update', async () => {
    const prisma = buildPrisma();
    const audit = buildAudit();
    const service = new SmsKeywordService(prisma, audit);

    await service.updateConfig(
      { bodyKeywords: [' GST ', 'gst', '', 'ARN'], headerKeywords: ['GSTN', 'gstn'], hideAfterForward: true },
      actor,
    );

    const stored = (prisma.systemSetting.upsert as jest.Mock).mock.calls[0][0].create.value;
    expect(stored).toEqual({
      bodyKeywords: ['GST', 'ARN'],
      headerKeywords: ['GSTN'],
      hideAfterForward: true,
    });
    expect(audit.recordAs).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'settings.smsKeywords.update' }),
    );
  });
});
