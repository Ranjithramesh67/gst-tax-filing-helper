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
});
