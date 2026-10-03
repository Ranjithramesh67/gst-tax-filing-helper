import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  filer: { email: 'filer@sharma.local', password: 'Filer@12345' },
  admin: { email: 'admin@sharma.local', password: 'Firm@12345' },
} as const;

describe('GSTFlow API (e2e)', () => {
  let app: INestApplication;
  let filerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await assertDatabaseReachable();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/v1/auth/login').send({ email, password });

  const isSuccess = (status: number) => status === 200 || status === 201;

  describe('health', () => {
    it('GET /v1/health returns 200 with status ok', async () => {
      const res = await request(app.getHttpServer()).get('/v1/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.db).toBe('ok');
    });
  });

  describe('auth', () => {
    it('POST /v1/auth/login with seeded FILER creds returns 200 and an accessToken', async () => {
      const res = await login(SEEDED.filer.email, SEEDED.filer.password);
      expect(isSuccess(res.status)).toBe(true);
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.accessToken.length).toBeGreaterThan(0);
      expect(res.body.user.role).toBe('FILER');
      filerToken = res.body.accessToken;
    });

    it('POST /v1/auth/login with a wrong password returns 401', async () => {
      await login(SEEDED.filer.email, 'definitely-not-the-password').expect(401);
    });

    it('GET /v1/auth/me with the FILER token returns 200 and role FILER', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${filerToken}`)
        .expect(200);
      expect(res.body.role).toBe('FILER');
      expect(res.body.email).toBe(SEEDED.filer.email);
    });
  });

  describe('clients RBAC', () => {
    it('POST /v1/clients as FILER is forbidden (403)', async () => {
      await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${filerToken}`)
        .send({ name: 'Forbidden Client', phone: '+919812345670' })
        .expect(403);
    });

    it('POST /v1/clients as FIRM_ADMIN returns 201 with an id, then it is searchable', async () => {
      const adminLogin = await login(SEEDED.admin.email, SEEDED.admin.password);
      expect(isSuccess(adminLogin.status)).toBe(true);
      adminToken = adminLogin.body.accessToken;

      const name = `E2E Client ${Date.now()}`;
      const created = await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name, phone: '+919812345671', stateCode: '29' })
        .expect(201);

      expect(typeof created.body.id).toBe('string');
      expect(created.body.id.length).toBeGreaterThan(0);
      expect(created.body.name).toBe(name);

      const listed = await request(app.getHttpServer())
        .get('/v1/clients')
        .query({ search: name })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(listed.body.total).toBeGreaterThanOrEqual(1);
      expect(listed.body.items.some((c: { id: string }) => c.id === created.body.id)).toBe(true);
    });

    it('GET /v1/clients without a token is unauthorized (401)', async () => {
      await request(app.getHttpServer()).get('/v1/clients').expect(401);
    });
  });

  describe('billing', () => {
    let token: string;
    let clientId: string;

    beforeAll(async () => {
      const res = await login(SEEDED.admin.email, SEEDED.admin.password);
      token = res.body.accessToken;
      const client = await request(app.getHttpServer())
        .post('/v1/clients')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Billing Client ${Date.now()}`, phone: '+919812345672', stateCode: '29' })
        .expect(201);
      clientId = client.body.id;
    });

    const auth = () => ({ Authorization: `Bearer ${token}` });

    it('runs an invoice from DRAFT to PAID through partial payment requests', async () => {
      const invoice = await request(app.getHttpServer())
        .post('/v1/billing/invoices')
        .set(auth())
        .send({
          clientId,
          type: 'CUMULATIVE',
          items: [{ description: 'Retainer', amount: 1000 }],
        })
        .expect(201);
      expect(invoice.body.status).toBe('DRAFT');
      const invoiceId = invoice.body.id;

      const issued = await request(app.getHttpServer())
        .patch(`/v1/billing/invoices/${invoiceId}`)
        .set(auth())
        .send({ status: 'ISSUED' })
        .expect(200);
      expect(issued.body.status).toBe('ISSUED');

      const partial = await request(app.getHttpServer())
        .post('/v1/billing/payment-requests')
        .set(auth())
        .send({ invoiceId, amount: 400 })
        .expect(201);
      const publicView = await request(app.getHttpServer())
        .get(`/v1/public/payment-requests/${partial.body.id}`)
        .expect(200);
      expect(publicView.body.amount).toBe(400);
      expect(publicView.body.firm.name).toBeTruthy();

      await request(app.getHttpServer())
        .post(`/v1/billing/payment-requests/${partial.body.id}/mark-paid`)
        .set(auth())
        .send({ method: 'UPI', reference: 'UPI-E2E' })
        .expect(201);

      const afterPartial = await request(app.getHttpServer())
        .get(`/v1/billing/invoices/${invoiceId}`)
        .set(auth())
        .expect(200);
      expect(afterPartial.body.status).toBe('PARTIAL');
      expect(afterPartial.body.paid).toBe(400);
      expect(afterPartial.body.outstanding).toBe(600);

      const rest = await request(app.getHttpServer())
        .post('/v1/billing/payment-requests')
        .set(auth())
        .send({ invoiceId, amount: 600 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/v1/billing/payment-requests/${rest.body.id}/mark-paid`)
        .set(auth())
        .send({ method: 'UPI' })
        .expect(201);

      const afterFull = await request(app.getHttpServer())
        .get(`/v1/billing/invoices/${invoiceId}`)
        .set(auth())
        .expect(200);
      expect(afterFull.body.status).toBe('PAID');
      expect(afterFull.body.outstanding).toBe(0);
    });

    it('returns 404 for an invoice belonging to a client outside the firm', async () => {
      await request(app.getHttpServer())
        .post('/v1/billing/invoices')
        .set(auth())
        .send({ clientId: 'missing-client', items: [{ description: 'x', amount: 1 }] })
        .expect(404);
    });

    it('creates and lists a subscription', async () => {
      const created = await request(app.getHttpServer())
        .post('/v1/billing/subscriptions')
        .set(auth())
        .send({ clientId, amount: 999, cycle: 'QUARTERLY' })
        .expect(201);
      expect(created.body.cycle).toBe('QUARTERLY');

      const listed = await request(app.getHttpServer())
        .get('/v1/billing/subscriptions')
        .set(auth())
        .expect(200);
      expect(listed.body.some((s: { id: string }) => s.id === created.body.id)).toBe(true);
    });

    it('requires authentication for firm billing endpoints', async () => {
      await request(app.getHttpServer()).get('/v1/billing/invoices').expect(401);
    });
  });
});
