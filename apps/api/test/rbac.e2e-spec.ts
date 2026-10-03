import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  superAdmin: { email: 'superadmin@gstflow.local', password: 'Admin@12345' },
  firmAdmin: { email: 'admin@sharma.local', password: 'Firm@12345' },
  filer: { email: 'filer@sharma.local', password: 'Filer@12345' },
} as const;

describe('RBAC roles & permissions (e2e)', () => {
  let app: INestApplication;
  let superToken: string;
  let firmAdminToken: string;
  let filerToken: string;
  let sharmaFirmId: string;
  let customRoleId: string;

  const suffix = `${Date.now()}`.slice(-7);
  const customRoleKey = `CUSTOM_${suffix}`;
  const customEmail = `custom.${suffix}@sharma.local`;
  const foreignSlug = `foreign-${suffix}`;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await assertDatabaseReachable();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    const superLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send(SEEDED.superAdmin);
    superToken = superLogin.body.accessToken;

    const adminLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send(SEEDED.firmAdmin);
    firmAdminToken = adminLogin.body.accessToken;

    const filerLogin = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send(SEEDED.filer);
    filerToken = filerLogin.body.accessToken;

    const firms = await request(app.getHttpServer())
      .get('/v1/admin/firms')
      .query({ pageSize: 200 })
      .set(auth(superToken));
    const sharma = firms.body.items.find(
      (firm: { slug: string }) => firm.slug === 'sharma-associates',
    );
    sharmaFirmId = sharma?.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('super admin sees the full permission catalog including platform permissions', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/permissions')
      .set(auth(superToken))
      .expect(200);
    const keys = res.body.groups.flatMap((group: { permissions: { key: string }[] }) =>
      group.permissions.map((p) => p.key),
    );
    expect(keys).toContain('clients:read');
    expect(keys).toContain('firms:manage');
  });

  it('super admin lists the three built-in system roles', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/roles')
      .query({ pageSize: 200 })
      .set(auth(superToken))
      .expect(200);
    const keys = res.body.items.map((role: { key: string }) => role.key);
    expect(keys).toEqual(expect.arrayContaining(['SUPER_ADMIN', 'FIRM_ADMIN', 'FILER']));
  });

  it('firm staff cannot reach the platform role endpoints', async () => {
    await request(app.getHttpServer())
      .get('/v1/admin/roles')
      .set(auth(firmAdminToken))
      .expect(403);
  });

  it('super admin creates a firm-scoped custom role', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/admin/roles')
      .set(auth(superToken))
      .send({
        key: customRoleKey,
        name: `Custom ${suffix}`,
        scope: 'FIRM',
        firmId: sharmaFirmId,
        permissions: ['clients:read'],
      })
      .expect(201);
    expect(res.body.scope).toBe('FIRM');
    expect(res.body.permissions).toEqual(['clients:read']);
    customRoleId = res.body.id;
  });

  it('rejects unknown permissions and platform permissions on firm roles', async () => {
    await request(app.getHttpServer())
      .post('/v1/admin/roles')
      .set(auth(superToken))
      .send({ key: `BAD_${suffix}`, name: 'Bad', scope: 'FIRM', firmId: sharmaFirmId, permissions: ['nope:read'] })
      .expect(400);

    await request(app.getHttpServer())
      .post('/v1/firm/roles')
      .set(auth(firmAdminToken))
      .send({ key: `PLAT_${suffix}`, name: 'Platform', permissions: ['firms:manage'] })
      .expect(400);
  });

  it('firm admin sees a firm-only permission catalog', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/firm/permissions')
      .set(auth(firmAdminToken))
      .expect(200);
    expect(res.body.permissions).toContain('clients:read');
    expect(res.body.permissions).not.toContain('firms:manage');
  });

  it('firm admin lists system + custom firm roles', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/firm/roles')
      .set(auth(firmAdminToken))
      .expect(200);
    const systemKeys = res.body.system.map((role: { key: string }) => role.key);
    const firmKeys = res.body.firm.map((role: { key: string }) => role.key);
    expect(systemKeys).toEqual(expect.arrayContaining(['FIRM_ADMIN', 'FILER']));
    expect(firmKeys).toContain(customRoleKey);
  });

  it('a member with a custom role only gets the granted permissions', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/firm/users')
      .set(auth(firmAdminToken))
      .send({
        name: 'Custom Member',
        email: customEmail,
        password: 'Custom@12345',
        roleId: customRoleId,
      })
      .expect(201);
    expect(created.body.role).toBe(customRoleKey);

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: customEmail, password: 'Custom@12345' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe(customRoleKey);
    expect(login.body.user.permissions).toEqual(['clients:read']);
    const memberToken = login.body.accessToken;

    await request(app.getHttpServer())
      .get('/v1/clients')
      .set(auth(memberToken))
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/clients')
      .set(auth(memberToken))
      .send({ name: 'Should Fail', phone: '+919800000000' })
      .expect(403);

    await request(app.getHttpServer())
      .get('/v1/firm/users')
      .set(auth(memberToken))
      .expect(403);
  });

  it('filer cannot list the firm team but the firm admin can', async () => {
    await request(app.getHttpServer())
      .get('/v1/firm/users')
      .set(auth(filerToken))
      .expect(403);

    const res = await request(app.getHttpServer())
      .get('/v1/firm/users')
      .set(auth(firmAdminToken))
      .expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('cross-firm role access returns 404', async () => {
    const firm = await request(app.getHttpServer())
      .post('/v1/admin/firms')
      .set(auth(superToken))
      .send({ name: `Foreign ${suffix}`, slug: foreignSlug })
      .expect(201);

    const foreignRole = await request(app.getHttpServer())
      .post('/v1/admin/roles')
      .set(auth(superToken))
      .send({
        key: `FOREIGN_${suffix}`,
        name: 'Foreign',
        scope: 'FIRM',
        firmId: firm.body.id,
        permissions: ['clients:read'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/firm/roles/${foreignRole.body.id}`)
      .set(auth(firmAdminToken))
      .send({ name: 'Hijack' })
      .expect(404);
  });
});
