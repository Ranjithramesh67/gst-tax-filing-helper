import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  superAdmin: { email: 'superadmin@gstflow.local', password: 'Admin@12345' },
  firmAdmin: { email: 'admin@sharma.local', password: 'Firm@12345' },
} as const;

describe('SMS retention settings (e2e)', () => {
  let app: INestApplication;
  let superToken: string;
  let firmToken: string;

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
    firmToken = (
      await request(app.getHttpServer()).post('/v1/auth/login').send(SEEDED.firmAdmin)
    ).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated and non super-admin access', async () => {
    await request(app.getHttpServer()).get('/v1/admin/settings/sms-retention').expect(401);
    await request(app.getHttpServer())
      .get('/v1/admin/settings/sms-retention')
      .set(auth(firmToken))
      .expect(403);
  });

  it('returns the current retention policy', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/admin/settings/sms-retention')
      .set(auth(superToken))
      .expect(200);

    expect(typeof response.body.enabled).toBe('boolean');
    expect(response.body.archiveAfterDays).toBeGreaterThan(0);
    expect(response.body.purgeBackupAfterDays).toBeGreaterThanOrEqual(
      response.body.archiveAfterDays,
    );
  });

  it('updates the policy and rejects an invalid window', async () => {
    const updated = await request(app.getHttpServer())
      .put('/v1/admin/settings/sms-retention')
      .set(auth(superToken))
      .send({ enabled: true, archiveAfterDays: 90, purgeBackupAfterDays: 200 })
      .expect(200);
    expect(updated.body).toMatchObject({
      enabled: true,
      archiveAfterDays: 90,
      purgeBackupAfterDays: 200,
    });

    await request(app.getHttpServer())
      .put('/v1/admin/settings/sms-retention')
      .set(auth(superToken))
      .send({ enabled: true, archiveAfterDays: 100, purgeBackupAfterDays: 10 })
      .expect(400);
  });

  it('reports a preview of affected data', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/admin/settings/sms-retention/preview')
      .set(auth(superToken))
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        liveCount: expect.any(Number),
        archiveCandidates: expect.any(Number),
        archivedCount: expect.any(Number),
        purgeCandidates: expect.any(Number),
      }),
    );
  });

  it('runs retention on demand', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/admin/settings/sms-retention/run')
      .set(auth(superToken))
      .send({})
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        archived: expect.any(Number),
        purged: expect.any(Number),
      }),
    );
  });

  it('exposes the policy publicly for the consent screen', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/public/retention')
      .expect(200);
    expect(typeof response.body.enabled).toBe('boolean');
    expect(response.body.archiveAfterDays).toBeGreaterThan(0);
  });
});
