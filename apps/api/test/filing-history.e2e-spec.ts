import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  firmAdmin: { email: 'admin@sharma.local', password: 'Firm@12345' },
} as const;

describe('Filing status history & SMS reconciliation (e2e)', () => {
  let app: INestApplication;
  let firmToken: string;
  let clientToken: string;
  let clientId: string;
  let returnId: string;
  let filingId: string;

  const suffix = `${Date.now()}`;
  const phone = `9${suffix.slice(-9)}`;
  const period = '2026-06';
  const arn = 'AA290621000123F';

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await assertDatabaseReachable();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    firmToken = (
      await request(app.getHttpServer()).post('/v1/auth/login').send(SEEDED.firmAdmin)
    ).body.accessToken;

    const created = await request(app.getHttpServer())
      .post('/v1/clients')
      .set(auth(firmToken))
      .send({ name: `History Test ${suffix}`, phone })
      .expect(201);
    clientId = created.body.id;

    const otp = await request(app.getHttpServer())
      .post('/v1/auth/otp/request')
      .send({ phone, purpose: 'LOGIN' })
      .expect(201);
    clientToken = (
      await request(app.getHttpServer())
        .post('/v1/auth/otp/verify')
        .send({ phone, code: otp.body.devCode, purpose: 'LOGIN' })
        .expect(201)
    ).body.accessToken;

    await request(app.getHttpServer())
      .post(`/v1/client/links/${clientId}/confirm`)
      .set(auth(clientToken))
      .expect(201);

    const gstReturn = await request(app.getHttpServer())
      .post('/v1/returns')
      .set(auth(firmToken))
      .send({ clientId, type: 'GSTR3B', period, status: 'PENDING' })
      .expect(201);
    returnId = gstReturn.body.id;

    const filing = await request(app.getHttpServer())
      .post('/v1/filings')
      .set(auth(firmToken))
      .send({ clientId, type: 'GSTR3B', period, returnId })
      .expect(201);
    filingId = filing.body.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('records a MANUAL event when a filing is created', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/filings/${filingId}/history`)
      .set(auth(firmToken))
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      filingId,
      status: 'PENDING',
      source: 'MANUAL',
      previousStatus: null,
    });
  });

  it('appends an event on a manual status change', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/filings/${filingId}/status`)
      .set(auth(firmToken))
      .send({ status: 'IN_REVIEW' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/v1/filings/${filingId}/history`)
      .set(auth(firmToken))
      .expect(200);
    expect(res.body[0]).toMatchObject({
      status: 'IN_REVIEW',
      previousStatus: 'PENDING',
      source: 'MANUAL',
    });
  });

  it('reconciles a filed acknowledgement SMS into the return and filing', async () => {
    const ingest = await request(app.getHttpServer())
      .post('/v1/sms/ingest')
      .set(auth(clientToken))
      .send({
        items: [
          {
            sender: 'GSTIN',
            body: `Your GSTR-3B for ${period.slice(5)}-${period.slice(0, 4)} has been filed successfully. ARN: ${arn}`,
            receivedAt: new Date().toISOString(),
            hash: `hist-recon-${suffix}`,
          },
        ],
      })
      .expect(201);
    expect(ingest.body.accepted).toBeGreaterThanOrEqual(1);

    const gstReturn = await request(app.getHttpServer())
      .get('/v1/returns')
      .query({ clientId })
      .set(auth(firmToken))
      .expect(200);
    const matched = gstReturn.body.items.find((row: { id: string }) => row.id === returnId);
    expect(matched.status).toBe('FILED');
    expect(matched.referenceNo).toBe(arn);

    const filing = await request(app.getHttpServer())
      .get('/v1/filings')
      .query({ clientId })
      .set(auth(firmToken))
      .expect(200);
    const matchedFiling = filing.body.items.find((row: { id: string }) => row.id === filingId);
    expect(matchedFiling.status).toBe('FILED');
  });

  it('records SMS-sourced return history with the ARN note', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/returns/${returnId}/history`)
      .set(auth(firmToken))
      .expect(200);
    const smsEvent = res.body.find(
      (event: { source: string; filingId: string | null }) =>
        event.source === 'SMS' && event.filingId === null,
    );
    expect(smsEvent).toMatchObject({ status: 'FILED', previousStatus: 'PENDING' });
    expect(smsEvent.smsMessageId).toBeTruthy();
  });

  it('records the SMS transition on the linked filing too', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/filings/${filingId}/history`)
      .set(auth(firmToken))
      .expect(200);
    const smsEvent = res.body.find((event: { source: string }) => event.source === 'SMS');
    expect(smsEvent).toMatchObject({ status: 'FILED', previousStatus: 'IN_REVIEW' });
  });

  it('returns 404 for an unknown filing history', async () => {
    await request(app.getHttpServer())
      .get('/v1/filings/does-not-exist/history')
      .set(auth(firmToken))
      .expect(404);
  });

  it('returns 404 for an unknown return history', async () => {
    await request(app.getHttpServer())
      .get('/v1/returns/does-not-exist/history')
      .set(auth(firmToken))
      .expect(404);
  });
});
