import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  firmAdmin: { email: 'admin@sharma.local', password: 'Firm@12345' },
} as const;

describe('Mutual-consent party linking (e2e)', () => {
  let app: INestApplication;
  let firmToken: string;
  let clientToken: string;
  let clientId: string;
  let phone: string;

  const suffix = `${Date.now()}`.slice(-7);
  phone = `9${`${Date.now()}`.slice(-9)}`;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const ingest = () =>
    request(app.getHttpServer())
      .post('/v1/sms/ingest')
      .set(auth(clientToken))
      .send({
        items: [
          {
            sender: 'GSTIN',
            body: 'GST invoice INV-1 of Rs 1,000 for GSTR-3B',
            receivedAt: new Date().toISOString(),
            hash: `linktest-${suffix}-${Date.now()}`,
          },
        ],
      });

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
      .send({ name: `Link Test ${suffix}`, phone, note: 'Please confirm our link' })
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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('creates the party as PENDING until confirmed', () => {
    return request(app.getHttpServer())
      .get(`/v1/clients/${clientId}`)
      .set(auth(firmToken))
      .expect(200)
      .expect((res) => {
        expect(res.body.linkStatus).toBe('PENDING');
      });
  });

  it('shows the pending request to the party', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/client/links')
      .set(auth(clientToken))
      .expect(200);
    const link = res.body.find((entry: { id: string }) => entry.id === clientId);
    expect(link).toBeDefined();
    expect(link.status).toBe('PENDING');
    expect(link.firm.slug).toBe('sharma-associates');
  });

  it('blocks SMS ingestion while the link is unconfirmed', async () => {
    await ingest().expect(403);
  });

  it('does not expose the party link endpoints to firm staff', async () => {
    await request(app.getHttpServer())
      .get('/v1/client/links')
      .set(auth(firmToken))
      .expect(403);
  });

  it('activates the link once the party confirms', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/client/links/${clientId}/confirm`)
      .set(auth(clientToken))
      .expect(201);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('forwards SMS only after confirmation', async () => {
    const res = await ingest().expect(201);
    expect(res.body.accepted).toBeGreaterThanOrEqual(1);

    const list = await request(app.getHttpServer())
      .get('/v1/sms')
      .query({ clientId })
      .set(auth(firmToken))
      .expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
  });

  it('stops forwarding once the party revokes the link', async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/client/links/${clientId}/revoke`)
      .set(auth(clientToken))
      .expect(201);
    expect(res.body.status).toBe('REVOKED');

    await ingest().expect(403);
  });
});
