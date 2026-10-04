import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  firmAdmin: { email: 'admin@sharma.local', password: 'Firm@12345' },
} as const;

describe('Unified inbox feed (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let firmToken: string;
  let clientToken: string;
  let clientId: string;
  let secondClientId: string;
  let secondClientToken: string;

  const suffix = `${Date.now()}`.slice(-7);
  const phone = `7${`${Date.now()}`.slice(-9)}`;
  const secondPhone = `6${`${Date.now() + 7}`.slice(-9)}`;

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
      .send({ name: `Inbox ${suffix}`, phone })
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
      data: { name: `Inbox Second Firm ${suffix}`, slug: `inbox-second-firm-${suffix}` },
    });
    const secondClient = await prisma.client.create({
      data: {
        firmId: secondFirm.id,
        name: `Inbox Second Client ${suffix}`,
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

  const ingestSms = async (code: string) => {
    const res = await request(app.getHttpServer())
      .post('/v1/sms/ingest')
      .set(auth(clientToken))
      .send({
        items: [
          {
            sender: 'AX-BANK-S',
            body: `Your login OTP is ${code}. Do not share.`,
            receivedAt: new Date().toISOString(),
            hash: `hash-${code}-${suffix}`,
          },
        ],
      })
      .expect(201);
    return res.body.ids[0] as string;
  };

  const ingestEmail = async (code: string, receivedAt = new Date().toISOString()) => {
    await request(app.getHttpServer())
      .post('/v1/otp/ingest')
      .set(auth(clientToken))
      .send({
        items: [
          {
            code,
            source: 'EMAIL',
            fromAddress: 'noreply@bank.example',
            subject: 'Your one-time password',
            snippet: `Your OTP is ${code}`,
            receivedAt,
            sourceRef: `email-${code}-${suffix}`,
          },
        ],
      })
      .expect(201);
  };

  const fetchInbox = async (token = clientToken, query = '') =>
    request(app.getHttpServer())
      .get(`/v1/inbox${query}`)
      .set(auth(token))
      .expect(200);

  it('collapses an SMS and email OTP with the same code into one grouped item', async () => {
    const code = '4821';
    const smsId = await ingestSms(code);
    await ingestEmail(code, new Date(Date.now() + 1000).toISOString());

    const res = await fetchInbox();
    const item = res.body.items.find((entry: { kind: string; code?: string }) => entry.kind === 'OTP' && entry.code === code);

    expect(item).toBeDefined();
    expect(item.sources.sort()).toEqual(['EMAIL', 'SMS']);
    expect(item.eventCount).toBe(2);
    expect(item.client.id).toBe(clientId);
    // The OTP snippet is masked: the raw code must never leak.
    expect(item.snippet ?? '').not.toContain(code);
    // The OTP SMS is represented by the group, never as a raw SMS row.
    expect(res.body.items.some((entry: { kind: string; id: string }) => entry.kind === 'SMS' && entry.id === smsId)).toBe(false);
  });

  it('keeps a different code as a separate OTP item', async () => {
    const code = '7733';
    await ingestSms(code);

    const res = await fetchInbox();
    const otpItems = res.body.items.filter((entry: { kind: string }) => entry.kind === 'OTP');
    const codes = otpItems.map((entry: { code: string }) => entry.code);

    expect(codes).toContain('4821');
    expect(codes).toContain(code);
    expect(otpItems.find((entry: { code: string }) => entry.code === code).eventCount).toBe(1);
  });

  it('returns non-OTP SMS as a kind:SMS row', async () => {
    const body = `Your order ${suffix} ${'x'.repeat(300)} has shipped`;
    const res = await request(app.getHttpServer())
      .post('/v1/sms/ingest')
      .set(auth(clientToken))
      .send({
        items: [
          { sender: 'AX-SHIP-S', body, receivedAt: new Date().toISOString(), hash: `ship-${suffix}` },
        ],
      })
      .expect(201);
    const smsId = res.body.ids[0];

    const inbox = await fetchInbox();
    const row = inbox.body.items.find(
      (entry: { kind: string; id: string }) => entry.kind === 'SMS' && entry.id === smsId,
    );
    expect(row).toBeDefined();
    // SMS bodies match the existing /sms feed: returned in full, no truncation.
    expect(row.body).toBe(body);
    expect(row.bodyEncrypted).toBeUndefined();
    expect(row.hash).toBeUndefined();
  });

  it('filters by search across OTP and SMS rows', async () => {
    const res = await fetchInbox(clientToken, '?search=4821');
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(
      res.body.items.every((entry: { kind: string; code?: string; sender?: string }) =>
        entry.kind === 'OTP' ? entry.code === '4821' : entry.sender?.includes('4821'),
      ),
    ).toBe(true);
  });

  it('isolates tenants and ignores a query-supplied clientId', async () => {
    const first = await fetchInbox();
    const firstOtpIds = first.body.items
      .filter((entry: { kind: string }) => entry.kind === 'OTP')
      .map((entry: { id: string }) => entry.id);

    const second = await fetchInbox(secondClientToken);
    const secondIds = second.body.items.map((entry: { id: string }) => entry.id);
    for (const id of firstOtpIds) expect(secondIds).not.toContain(id);

    // A supplied clientId that is not the actor's own must yield no rows.
    const crossed = await fetchInbox(secondClientToken, `?clientId=${clientId}`);
    expect(crossed.body.items).toHaveLength(0);
  });

  it('lets firm staff read the firm-wide inbox and still rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/v1/inbox').expect(401);

    const res = await request(app.getHttpServer())
      .get('/v1/inbox')
      .set(auth(firmToken))
      .expect(200);

    // Staff see the grouped OTP items belonging to their firm's clients.
    const mine = res.body.items.filter(
      (entry: { kind: string; client?: { id: string } }) =>
        entry.kind === 'OTP' && entry.client?.id === clientId,
    );
    expect(mine.length).toBeGreaterThan(0);

    // A query clientId outside the firm (the second tenant's client) yields
    // nothing, even for staff.
    const crossed = await request(app.getHttpServer())
      .get(`/v1/inbox?clientId=${secondClientId}`)
      .set(auth(firmToken))
      .expect(200);
    expect(crossed.body.items).toHaveLength(0);
  });

  it('returns code-masked per-event detail for an OTP group', async () => {
    const code = '5599';
    await ingestSms(code);
    await ingestEmail(code, new Date(Date.now() + 1000).toISOString());

    const list = await fetchInbox();
    const item = list.body.items.find(
      (entry: { kind: string; code?: string }) => entry.kind === 'OTP' && entry.code === code,
    );
    expect(item).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(`/v1/inbox/${item.id}`)
      .set(auth(clientToken))
      .expect(200);
    expect(detail.body.id).toBe(item.id);
    expect(detail.body.code).toBe(code);
    expect(detail.body.client.id).toBe(clientId);
    expect(detail.body.events).toHaveLength(2);
    expect(detail.body.events.map((event: { source: string }) => event.source).sort()).toEqual([
      'EMAIL',
      'SMS',
    ]);
    for (const event of detail.body.events) {
      expect(event.snippet ?? '').not.toContain(code);
    }
  });

  it('groups an OTP across SMS and EMAIL sources into one item and isolates it by tenant', async () => {
    // A per-run unique code keeps the assertions independent of any OTP event
    // already in the database (including re-runs within the rolling window).
    const uniqueCode = () => `${Math.floor(100000 + Math.random() * 900000)}`;
    const code = uniqueCode();
    const otherCode = uniqueCode();

    // Delta baseline: the unique code is unknown to this tenant before ingest.
    const before = await fetchInbox(firmToken);
    expect(before.body.items.some((entry: { code?: string }) => entry.code === code)).toBe(false);

    // SMS source path: the body carries the OTP; ingest extracts and files it.
    const smsId = await ingestSms(code);
    // EMAIL source path: same code, < window (default 300s) later.
    await ingestEmail(code, new Date(Date.now() + 1000).toISOString());

    const after = await fetchInbox(firmToken);
    const grouped = after.body.items.filter(
      (entry: { kind: string; code?: string }) => entry.kind === 'OTP' && entry.code === code,
    );
    expect(grouped).toHaveLength(1);
    expect(grouped[0].sources.sort()).toEqual(['EMAIL', 'SMS']);
    expect(grouped[0].eventCount).toBe(2);
    expect(grouped[0].client.id).toBe(clientId);
    // The code is masked in any snippet and the underlying SMS is represented
    // by the group, never as a raw kind:SMS row.
    expect(grouped[0].snippet ?? '').not.toContain(code);
    expect(
      after.body.items.some(
        (entry: { kind: string; id: string }) => entry.kind === 'SMS' && entry.id === smsId,
      ),
    ).toBe(false);

    // A different code lands in its own OTP item.
    await ingestSms(otherCode);
    const withOther = await fetchInbox(firmToken);
    const otherGrouped = withOther.body.items.filter(
      (entry: { kind: string; code?: string }) => entry.kind === 'OTP' && entry.code === otherCode,
    );
    expect(otherGrouped).toHaveLength(1);
    expect(otherGrouped[0].eventCount).toBe(1);
    expect(otherGrouped[0].sources).toEqual(['SMS']);

    // Cross-firm isolation: another tenant never sees the group.
    const foreign = await fetchInbox(secondClientToken);
    expect(
      foreign.body.items.some(
        (entry: { id: string; code?: string }) =>
          entry.id === grouped[0].id || entry.code === code,
      ),
    ).toBe(false);
  });

  it('isolates OTP detail by tenant and hides unknown groups', async () => {
    const code = '6688';
    await ingestSms(code);
    const list = await fetchInbox();
    const item = list.body.items.find(
      (entry: { kind: string; code?: string }) => entry.kind === 'OTP' && entry.code === code,
    );
    expect(item).toBeDefined();

    // Same-firm staff can read the group detail.
    await request(app.getHttpServer())
      .get(`/v1/inbox/${item.id}`)
      .set(auth(firmToken))
      .expect(200);

    // A different tenant's client never can.
    await request(app.getHttpServer())
      .get(`/v1/inbox/${item.id}`)
      .set(auth(secondClientToken))
      .expect(404);

    await request(app.getHttpServer()).get('/v1/inbox/does-not-exist').expect(401);
    await request(app.getHttpServer())
      .get('/v1/inbox/does-not-exist')
      .set(auth(firmToken))
      .expect(404);
    await request(app.getHttpServer())
      .get('/v1/inbox/does-not-exist')
      .set(auth(clientToken))
      .expect(404);
  });

  it('keeps firm staff detail scoped to their own firm', async () => {
    // Create a group under the second firm's client.
    const secondCode = `9${Math.floor(10000 + Math.random() * 90000)}`;
    await request(app.getHttpServer())
      .post('/v1/sms/ingest')
      .set(auth(secondClientToken))
      .send({
        items: [
          {
            sender: 'AX-BANK-S',
            body: `Your login OTP is ${secondCode}. Do not share.`,
            receivedAt: new Date().toISOString(),
            hash: `hash-second-${secondCode}-${suffix}`,
          },
        ],
      })
      .expect(201);

    const secondList = await fetchInbox(secondClientToken);
    const secondItem = secondList.body.items.find(
      (entry: { kind: string; code?: string }) =>
        entry.kind === 'OTP' && entry.code === secondCode,
    );
    expect(secondItem).toBeDefined();

    // Primary firm staff cannot see it in the feed, even when narrowing to the
    // second firm's client id...
    const firmList = await fetchInbox(firmToken, `?clientId=${secondClientId}`);
    expect(firmList.body.items.some((entry: { id: string }) => entry.id === secondItem.id)).toBe(
      false,
    );

    // ...nor read its detail: cross-firm is a 404, never a leak.
    await request(app.getHttpServer())
      .get(`/v1/inbox/${secondItem.id}`)
      .set(auth(firmToken))
      .expect(404);
  });
});
