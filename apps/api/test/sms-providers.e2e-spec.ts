import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  superAdmin: { email: 'superadmin@gstflow.local', password: 'Admin@12345' },
  firmAdmin: { email: 'admin@sharma.local', password: 'Firm@12345' },
} as const;

const UNREACHABLE_URL = 'http://127.0.0.1:9/api/smsapi';

describe('SMS providers admin (e2e)', () => {
  let app: INestApplication;
  let superToken: string;
  let firmToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const suffix = `${Date.now()}`;
  const secret = `secret-key-${suffix}`;

  const baseProvider = (name: string, overrides: Record<string, unknown> = {}) => ({
    name,
    url: UNREACHABLE_URL,
    method: 'GET',
    sender: 'VHOMEE',
    route: '4',
    templateId: '1207170351303889084',
    header: 'VHOMEE',
    credentials: { key: secret },
    messageTemplate: 'Hi, Your OTP to Login into {{app name}} App is {{variable}}.',
    appName: 'GSTFlow',
    timeoutMs: 1000,
    ...overrides,
  });

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

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer()).get('/v1/admin/sms-providers').expect(401);
  });

  it('rejects non super-admin access', async () => {
    await request(app.getHttpServer())
      .get('/v1/admin/sms-providers')
      .set(auth(firmToken))
      .expect(403);
  });

  it('creates a provider without leaking the secret', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/admin/sms-providers')
      .set(auth(superToken))
      .send(baseProvider(`Primary ${suffix}`, { isActive: true }))
      .expect(201);

    expect(response.body.provider).toBe('PING4SMS');
    expect(response.body.hasCredentials).toBe(true);
    expect(response.body.credentialKeys).toEqual(['key']);
    expect(response.body.isActive).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(secret);

    await request(app.getHttpServer())
      .patch(`/v1/admin/sms-providers/${response.body.id}`)
      .set(auth(superToken))
      .send({ isActive: false })
      .expect(200);
  });

  it('updates fields but preserves credentials when omitted', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/admin/sms-providers')
      .set(auth(superToken))
      .send(baseProvider(`Secondary ${suffix}`))
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/v1/admin/sms-providers/${created.body.id}`)
      .set(auth(superToken))
      .send({ sender: 'VHOME2' })
      .expect(200);

    expect(updated.body.sender).toBe('VHOME2');
    expect(updated.body.credentialKeys).toEqual(['key']);
    expect(JSON.stringify(updated.body)).not.toContain(secret);

    await request(app.getHttpServer())
      .patch(`/v1/admin/sms-providers/${created.body.id}`)
      .set(auth(superToken))
      .send({ isActive: false })
      .expect(200);
  });

  it('activates exactly one provider at a time', async () => {
    const first = await request(app.getHttpServer())
      .post('/v1/admin/sms-providers')
      .set(auth(superToken))
      .send(baseProvider(`Active-A ${suffix}`, { isActive: true }))
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/v1/admin/sms-providers')
      .set(auth(superToken))
      .send(baseProvider(`Active-B ${suffix}`))
      .expect(201);

    const activated = await request(app.getHttpServer())
      .post(`/v1/admin/sms-providers/${second.body.id}/activate`)
      .set(auth(superToken))
      .send({})
      .expect(201);
    expect(activated.body.isActive).toBe(true);

    const firstAfter = await request(app.getHttpServer())
      .get(`/v1/admin/sms-providers/${first.body.id}`)
      .set(auth(superToken))
      .expect(200);
    expect(firstAfter.body.isActive).toBe(false);

    await request(app.getHttpServer())
      .patch(`/v1/admin/sms-providers/${second.body.id}`)
      .set(auth(superToken))
      .send({ isActive: false })
      .expect(200);
  });

  it('tests a saved provider against multiple numbers without exposing the secret', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/admin/sms-providers')
      .set(auth(superToken))
      .send(baseProvider(`Testable ${suffix}`))
      .expect(201);

    const report = await request(app.getHttpServer())
      .post('/v1/admin/sms-providers/test')
      .set(auth(superToken))
      .send({ providerId: created.body.id, numbers: ['9999999999', '8888888888'] })
      .expect(201);

    expect(report.body.total).toBe(2);
    expect(report.body.results).toHaveLength(2);
    expect(report.body.successCount).toBe(0);
    expect(report.body.results[0].preview).toContain('GSTFlow');
    expect(JSON.stringify(report.body)).not.toContain(secret);
  });

  it('tests an inline config and rejects an empty test request', async () => {
    await request(app.getHttpServer())
      .post('/v1/admin/sms-providers/test')
      .set(auth(superToken))
      .send({ numbers: ['9999999999'] })
      .expect(400);

    const report = await request(app.getHttpServer())
      .post('/v1/admin/sms-providers/test')
      .set(auth(superToken))
      .send({
        numbers: ['9999999999'],
        code: '123456',
        config: {
          url: UNREACHABLE_URL,
          sender: 'VHOMEE',
          credentials: { key: secret },
          messageTemplate: 'Test {{variable}}',
          appName: 'GSTFlow',
        },
      })
      .expect(201);

    expect(report.body.total).toBe(1);
    expect(report.body.code).toBe('123456');
    expect(report.body.results[0].ok).toBe(false);
  });
});
