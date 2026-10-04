import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  firmAdmin: { email: 'admin@sharma.local', password: 'Firm@12345' },
} as const;

describe('OTP email ingest (e2e)', () => {
  let app: INestApplication;
  let firmToken: string;
  let clientToken: string;
  let clientId: string;

  const suffix = `${Date.now()}`.slice(-7);
  const phone = `9${`${Date.now()}`.slice(-9)}`;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await assertDatabaseReachable();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    const adminLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send(SEEDED.firmAdmin);
    firmToken = adminLogin.body.accessToken;

    const created = await request(app.getHttpServer())
      .post('/v1/clients')
      .set(auth(firmToken))
      .send({ name: `OTP Ingest ${suffix}`, phone })
      .expect(201);
    clientId = created.body.id;

    const otp = await request(app.getHttpServer())
      .post('/v1/auth/otp/request')
      .send({ phone, purpose: 'LOGIN' })
      .expect(201);
    const verified = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .send({ phone, code: otp.body.devCode, purpose: 'LOGIN' })
      .expect(201);
    clientToken = verified.body.accessToken;

    await request(app.getHttpServer())
      .post(`/v1/client/links/${clientId}/confirm`)
      .set(auth(clientToken))
      .expect(201);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const item = () => ({
    code: '4831',
    source: 'EMAIL',
    fromAddress: 'noreply@bank.example',
    subject: 'Your one-time password',
    snippet: 'Your OTP is ••••',
    receivedAt: '2026-10-04T10:00:00.000Z',
    sourceRef: `email-${suffix}`,
  });

  it('accepts an email OTP, then reports the same sourceRef as a duplicate', async () => {
    const first = await request(app.getHttpServer())
      .post('/v1/otp/ingest')
      .set(auth(clientToken))
      .send({ items: [item()] })
      .expect(201);

    expect(first.body.accepted).toBe(1);
    expect(first.body.duplicates).toBe(0);
    expect(first.body.rejected).toBe(0);
    expect(first.body.ids).toHaveLength(1);

    const second = await request(app.getHttpServer())
      .post('/v1/otp/ingest')
      .set(auth(clientToken))
      .send({ items: [item()] })
      .expect(201);

    expect(second.body.accepted).toBe(0);
    expect(second.body.duplicates).toBe(1);
    expect(second.body.rejected).toBe(0);
    expect(second.body.ids).toHaveLength(0);
  });

  it('rejects a payload whose sourceRef is missing', async () => {
    const { sourceRef: _omitted, ...withoutRef } = item();
    await request(app.getHttpServer())
      .post('/v1/otp/ingest')
      .set(auth(clientToken))
      .send({ items: [withoutRef] })
      .expect(400);
  });

  it('forbids a firm-scoped token from posting as a client', async () => {
    await request(app.getHttpServer())
      .post('/v1/otp/ingest')
      .set(auth(firmToken))
      .send({ items: [item()] })
      .expect(403);
  });
});
