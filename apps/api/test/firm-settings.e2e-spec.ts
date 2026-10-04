import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  superAdmin: { email: 'superadmin@gstflow.local', password: 'Admin@12345' },
  firmAdmin: { email: 'admin@sharma.local', password: 'Firm@12345' },
  filer: { email: 'filer@sharma.local', password: 'Filer@12345' },
} as const;

describe('Firm settings self-service (e2e)', () => {
  let app: INestApplication;
  let superToken: string;
  let firmAdminToken: string;
  let filerToken: string;
  let original: Record<string, unknown> = {};

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await assertDatabaseReachable();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    superToken = (
      await request(app.getHttpServer()).post('/v1/auth/login').send(SEEDED.superAdmin)
    ).body.accessToken;
    firmAdminToken = (
      await request(app.getHttpServer()).post('/v1/auth/login').send(SEEDED.firmAdmin)
    ).body.accessToken;
    filerToken = (
      await request(app.getHttpServer()).post('/v1/auth/login').send(SEEDED.filer)
    ).body.accessToken;

    const profile = await request(app.getHttpServer())
      .get('/v1/firm/profile')
      .set(auth(firmAdminToken))
      .expect(200);
    original = {
      name: profile.body.name,
      gstin: profile.body.gstin,
      email: profile.body.email,
      phone: profile.body.phone,
      logoUrl: profile.body.logoUrl,
      brandColor: profile.body.brandColor,
      supportEmail: profile.body.supportEmail,
      supportPhone: profile.body.supportPhone,
      address: profile.body.address,
      defaultFilingFee: profile.body.defaultFilingFee,
    };
  });

  afterAll(async () => {
    if (app && firmAdminToken && Object.keys(original).length) {
      await request(app.getHttpServer())
        .patch('/v1/firm/profile')
        .set(auth(firmAdminToken))
        .send(original)
        .catch(() => undefined);
      await app.close();
    }
  });

  it('firm admin reads their own profile', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/firm/profile')
      .set(auth(firmAdminToken))
      .expect(200);
    expect(res.body.slug).toBe('sharma-associates');
    expect(res.body.name).toBeTruthy();
  });

  it('filer cannot read the firm profile without firm:read', async () => {
    await request(app.getHttpServer())
      .get('/v1/firm/profile')
      .set(auth(filerToken))
      .expect(403);
  });

  it('firm admin updates branding and contact fields', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/firm/profile')
      .set(auth(firmAdminToken))
      .send({
        brandColor: '#123456',
        supportEmail: 'settings.e2e@sharma.local',
        address: 'E2E Test Address',
        defaultFilingFee: 1499,
      })
      .expect(200);
    expect(res.body.brandColor).toBe('#123456');
    expect(res.body.supportEmail).toBe('settings.e2e@sharma.local');
    expect(res.body.address).toBe('E2E Test Address');
    expect(res.body.defaultFilingFee).toBe(1499);

    const reread = await request(app.getHttpServer())
      .get('/v1/firm/profile')
      .set(auth(firmAdminToken))
      .expect(200);
    expect(reread.body.brandColor).toBe('#123456');
  });

  it('cannot change the firm slug or status through the self-service endpoint', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/firm/profile')
      .set(auth(firmAdminToken))
      .send({ slug: 'hijacked-path', status: 'SUSPENDED', address: 'Still here' })
      .expect(200);
    expect(res.body.slug).toBe('sharma-associates');
    expect(res.body.status).toBe('ACTIVE');
  });

  it('clears nullable fields when sent as null', async () => {
    const res = await request(app.getHttpServer())
      .patch('/v1/firm/profile')
      .set(auth(firmAdminToken))
      .send({ brandColor: null, defaultFilingFee: null })
      .expect(200);
    expect(res.body.brandColor).toBeNull();
    expect(res.body.defaultFilingFee).toBeNull();
  });

  it('rejects an invalid brand colour', async () => {
    await request(app.getHttpServer())
      .patch('/v1/firm/profile')
      .set(auth(firmAdminToken))
      .send({ brandColor: 'not-a-color' })
      .expect(400);
  });

  it('super admin without a firm gets 400', async () => {
    await request(app.getHttpServer())
      .get('/v1/firm/profile')
      .set(auth(superToken))
      .expect(400);
  });

  it('records an audit entry for the profile update', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/audit')
      .query({ action: 'firm.profile.update', pageSize: 50 })
      .set(auth(superToken))
      .expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });
});
