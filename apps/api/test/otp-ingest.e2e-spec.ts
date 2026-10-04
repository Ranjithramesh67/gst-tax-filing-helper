import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  firmAdmin: { email: 'admin@sharma.local', password: 'Firm@12345' },
} as const;

describe('OTP email ingest (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let firmToken: string;
  let clientToken: string;
  let clientId: string;
  let secondFirmId: string;
  let secondClientId: string;
  let secondClientToken: string;

  const suffix = `${Date.now()}`.slice(-7);
  const phone = `9${`${Date.now()}`.slice(-9)}`;
  const secondPhone = `8${`${Date.now() + 7}`.slice(-9)}`;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await assertDatabaseReachable();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    prisma = app.get(PrismaService);

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

    const secondFirm = await prisma.firm.create({
      data: { name: `OTP Second Firm ${suffix}`, slug: `otp-second-firm-${suffix}` },
    });
    secondFirmId = secondFirm.id;
    const secondClient = await prisma.client.create({
      data: {
        firmId: secondFirmId,
        name: `OTP Second Client ${suffix}`,
        phone: secondPhone,
        linkStatus: 'ACTIVE',
        consentGranted: true,
      },
    });
    secondClientId = secondClient.id;

    const secondOtp = await request(app.getHttpServer())
      .post('/v1/auth/otp/request')
      .send({ phone: secondPhone, purpose: 'LOGIN' })
      .expect(201);
    const secondVerified = await request(app.getHttpServer())
      .post('/v1/auth/otp/verify')
      .send({ phone: secondPhone, code: secondOtp.body.devCode, purpose: 'LOGIN' })
      .expect(201);
    secondClientToken = secondVerified.body.accessToken;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const item = (overrides: Record<string, unknown> = {}) => ({
    code: '4831',
    source: 'EMAIL',
    fromAddress: 'noreply@bank.example',
    subject: 'Your one-time password',
    snippet: 'Your OTP is ••••',
    receivedAt: '2026-10-04T10:00:00.000Z',
    sourceRef: `email-${suffix}`,
    ...overrides,
  });

  const ingestItem = (token: string, overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/v1/otp/ingest')
      .set(auth(token))
      .send({ items: [item(overrides)] });

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

  it('rejects an unauthenticated request with 401', async () => {
    await request(app.getHttpServer())
      .post('/v1/otp/ingest')
      .send({ items: [item({ sourceRef: `email-unauth-${suffix}` })] })
      .expect(401);
  });

  it('keeps each firm isolated when a second client ingests an OTP', async () => {
    const beforeFirst = await prisma.otpEvent.count({ where: { clientId } });
    const beforeSecond = await prisma.otpEvent.count({ where: { clientId: secondClientId } });
    const secondRef = `email-second-${suffix}`;

    const res = await ingestItem(secondClientToken, { sourceRef: secondRef }).expect(201);
    expect(res.body.accepted).toBe(1);
    expect(res.body.duplicates).toBe(0);
    expect(res.body.rejected).toBe(0);
    expect(res.body.ids).toHaveLength(1);

    const secondRows = await prisma.otpEvent.findMany({ where: { sourceRef: secondRef } });
    expect(secondRows).toHaveLength(1);
    expect(secondRows[0].clientId).toBe(secondClientId);
    expect(secondRows[0].firmId).toBe(secondFirmId);
    expect(secondRows[0].source).toBe('EMAIL');

    expect(await prisma.otpEvent.count({ where: { clientId: secondClientId } })).toBe(
      beforeSecond + 1,
    );
    expect(await prisma.otpEvent.count({ where: { clientId } })).toBe(beforeFirst);
    expect(await prisma.otpEvent.count({ where: { firmId: secondFirmId } })).toBe(beforeSecond + 1);

    const firstRef = `email-first-${suffix}`;
    await ingestItem(clientToken, { sourceRef: firstRef }).expect(201);

    expect(await prisma.otpEvent.count({ where: { clientId } })).toBe(beforeFirst + 1);
    expect(await prisma.otpEvent.count({ where: { clientId: secondClientId } })).toBe(
      beforeSecond + 1,
    );
    expect(await prisma.otpEvent.count({ where: { firmId: secondFirmId } })).toBe(beforeSecond + 1);

    expect(await prisma.otpEvent.count({ where: { clientId, sourceRef: secondRef } })).toBe(0);
    expect(
      await prisma.otpEvent.count({
        where: { firmId: secondFirmId, sourceRef: { startsWith: `email-first-${suffix}` } },
      }),
    ).toBe(0);
  });

  it('rejects a source other than EMAIL', async () => {
    await ingestItem(clientToken, {
      source: 'SMS',
      sourceRef: `email-badsource-${suffix}`,
    }).expect(400);
  });

  it('enforces the sourceRef length boundaries', async () => {
    await ingestItem(clientToken, { sourceRef: 'abc' }).expect(400);
    await ingestItem(clientToken, { sourceRef: 'abcd' }).expect(201);
    await ingestItem(clientToken, { sourceRef: 'a'.repeat(200) }).expect(201);
    await ingestItem(clientToken, { sourceRef: 'a'.repeat(201) }).expect(400);
  });

  it('enforces the code length boundaries', async () => {
    await ingestItem(clientToken, { code: '12', sourceRef: `email-code2-${suffix}` }).expect(400);
    await ingestItem(clientToken, { code: '123', sourceRef: `email-code3-${suffix}` }).expect(201);
    await ingestItem(clientToken, {
      code: '123456789012',
      sourceRef: `email-code12-${suffix}`,
    }).expect(201);
    await ingestItem(clientToken, {
      code: '1234567890123',
      sourceRef: `email-code13-${suffix}`,
    }).expect(400);
  });
});
