import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  firmAdmin: { email: 'admin@sharma.local', password: 'Firm@12345' },
} as const;

describe('SMS ingest de-duplication across capture paths (e2e)', () => {
  let app: INestApplication;
  let firmToken: string;
  let clientToken: string;
  let clientId: string;

  const suffix = `${Date.now()}`.slice(-7);
  const phone = `9${`${Date.now()}`.slice(-9)}`;
  const sender = 'AD-GSTIND-S';
  const body = 'One Time Password for GST is 111222. GSTN';

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
      .send({ name: `Dedupe Test ${suffix}`, phone })
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

  it('stores one row when the broadcast and inbox paths report the same SMS', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/sms/ingest')
      .set(auth(clientToken))
      .send({
        items: [
          {
            sender,
            body,
            // Broadcast path: sub-second precision.
            receivedAt: '2026-10-04T13:40:14.697Z',
            hash: `broadcast-${suffix}-a`,
          },
          {
            sender,
            body,
            // Inbox path: whole-second precision for the same message.
            receivedAt: '2026-10-04T13:40:14.000Z',
            hash: `inbox-${suffix}-b`,
          },
        ],
      })
      .expect(201);

    expect(res.body.accepted).toBe(1);
    expect(res.body.duplicates).toBe(1);

    const list = await request(app.getHttpServer())
      .get('/v1/sms')
      .query({ clientId, pageSize: 50 })
      .set(auth(firmToken))
      .expect(200);
    const matches = list.body.items.filter((item: { body: string }) => item.body === body);
    expect(matches).toHaveLength(1);
  });
});
