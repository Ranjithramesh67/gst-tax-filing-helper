import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  superAdmin: { email: 'superadmin@gstflow.local', password: 'Admin@12345' },
  firmAdmin: { email: 'admin@sharma.local', password: 'Firm@12345' },
} as const;

const DEFAULTS = {
  groupWindowSeconds: 300,
  emailEnabled: true,
  providersEnabled: { imap: true, gmail: true, graph: true },
} as const;

describe('Admin OTP settings (e2e)', () => {
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
    if (superToken) {
      await request(app.getHttpServer())
        .put('/v1/admin/settings/otp')
        .set(auth(superToken))
        .send(DEFAULTS)
        .catch(() => undefined);
    }
    await app.close();
  });

  it('guards the OTP settings behind super admin', async () => {
    await request(app.getHttpServer()).get('/v1/admin/settings/otp').expect(401);
    await request(app.getHttpServer())
      .get('/v1/admin/settings/otp')
      .set(auth(firmToken))
      .expect(403);
    await request(app.getHttpServer())
      .put('/v1/admin/settings/otp')
      .set(auth(firmToken))
      .send(DEFAULTS)
      .expect(403);
  });

  it('reads a well-shaped config', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/admin/settings/otp')
      .set(auth(superToken))
      .expect(200);

    expect(typeof response.body.groupWindowSeconds).toBe('number');
    expect(response.body.groupWindowSeconds).toBeGreaterThanOrEqual(30);
    expect(response.body.groupWindowSeconds).toBeLessThanOrEqual(3600);
    expect(typeof response.body.emailEnabled).toBe('boolean');
    expect(response.body.providersEnabled).toEqual(
      expect.objectContaining({
        imap: expect.any(Boolean),
        gmail: expect.any(Boolean),
        graph: expect.any(Boolean),
      }),
    );
  });

  it('persists an update and round-trips it', async () => {
    const payload = {
      groupWindowSeconds: 120,
      emailEnabled: false,
      providersEnabled: { imap: false, gmail: true, graph: false },
    };

    const updated = await request(app.getHttpServer())
      .put('/v1/admin/settings/otp')
      .set(auth(superToken))
      .send(payload)
      .expect(200);
    expect(updated.body).toEqual(expect.objectContaining(payload));

    const reread = await request(app.getHttpServer())
      .get('/v1/admin/settings/otp')
      .set(auth(superToken))
      .expect(200);
    expect(reread.body).toEqual(expect.objectContaining(payload));
  });

  it('rejects out-of-range windows and unknown provider keys', async () => {
    await request(app.getHttpServer())
      .put('/v1/admin/settings/otp')
      .set(auth(superToken))
      .send({ ...DEFAULTS, groupWindowSeconds: 5 })
      .expect(400);

    await request(app.getHttpServer())
      .put('/v1/admin/settings/otp')
      .set(auth(superToken))
      .send({ ...DEFAULTS, groupWindowSeconds: 5000 })
      .expect(400);

    await request(app.getHttpServer())
      .put('/v1/admin/settings/otp')
      .set(auth(superToken))
      .send({
        ...DEFAULTS,
        providersEnabled: { imap: true, gmail: true, graph: true, outlook: true },
      })
      .expect(400);
  });
});
