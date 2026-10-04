import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

process.env.REMINDERS_ENABLED = 'false';

import { AppModule } from '../src/app.module';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  superAdmin: { email: 'superadmin@gstflow.local', password: 'Admin@12345' },
  firmAdmin: { email: 'admin@sharma.local', password: 'Firm@12345' },
} as const;

const DAY_MS = 86_400_000;

describe('Deadline reminders & notifications (e2e)', () => {
  let app: INestApplication;
  let superToken: string;
  let firmAdminToken: string;
  let clientId: string;
  let dueSoonReturnId: string;
  let overdueReturnId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const uniquePeriod = `${3000 + (Date.now() % 1000)}-03`;

  beforeAll(async () => {
    await assertDatabaseReachable();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    superToken = (
      await request(app.getHttpServer()).post('/v1/auth/login').send(SEEDED.superAdmin)
    ).body.accessToken;
    firmAdminToken = (
      await request(app.getHttpServer()).post('/v1/auth/login').send(SEEDED.firmAdmin)
    ).body.accessToken;

    const clients = await request(app.getHttpServer())
      .get('/v1/clients')
      .query({ pageSize: 50 })
      .set(auth(firmAdminToken))
      .expect(200);
    clientId = clients.body.items[0].id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('firm admin creates a return due in three days', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/returns')
      .set(auth(firmAdminToken))
      .send({
        clientId,
        type: 'GSTR3B',
        period: uniquePeriod,
        dueDate: new Date(Date.now() + 3 * DAY_MS).toISOString(),
      })
      .expect(201);
    dueSoonReturnId = res.body.id;
    expect(dueSoonReturnId).toBeTruthy();
  });

  it('firm admin creates an overdue return', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/returns')
      .set(auth(firmAdminToken))
      .send({
        clientId,
        type: 'GSTR1',
        period: uniquePeriod,
        dueDate: new Date(Date.now() - 2 * DAY_MS).toISOString(),
      })
      .expect(201);
    overdueReturnId = res.body.id;
  });

  it('runs reminders and creates due-soon and overdue notifications', async () => {
    const run = await request(app.getHttpServer())
      .post('/v1/reminders/run')
      .set(auth(superToken))
      .expect(201);
    expect(run.body.created).toBeGreaterThanOrEqual(1);

    const list = await request(app.getHttpServer())
      .get('/v1/notifications')
      .query({ pageSize: 200 })
      .set(auth(firmAdminToken))
      .expect(200);

    const dueSoon = list.body.items.filter(
      (n: { entityId: string; type: string }) => n.entityId === dueSoonReturnId,
    );
    const overdue = list.body.items.filter(
      (n: { entityId: string; type: string }) => n.entityId === overdueReturnId,
    );

    expect(dueSoon).toHaveLength(1);
    expect(dueSoon[0].type).toBe('RETURN_DUE_3D');
    expect(overdue).toHaveLength(1);
    expect(overdue[0].type).toBe('RETURN_OVERDUE');
  });

  it('reports an unread count for the firm', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/notifications/unread-count')
      .set(auth(firmAdminToken))
      .expect(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
  });

  it('does not duplicate a notification on a second run', async () => {
    await request(app.getHttpServer())
      .post('/v1/reminders/run')
      .set(auth(superToken))
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/v1/notifications')
      .query({ pageSize: 200 })
      .set(auth(firmAdminToken))
      .expect(200);
    const dueSoon = list.body.items.filter(
      (n: { entityId: string; type: string }) => n.entityId === dueSoonReturnId,
    );
    expect(dueSoon).toHaveLength(1);
  });

  it('marks a notification read and clears it from the unread count', async () => {
    const list = await request(app.getHttpServer())
      .get('/v1/notifications')
      .query({ pageSize: 200 })
      .set(auth(firmAdminToken))
      .expect(200);
    const target = list.body.items.find(
      (n: { entityId: string; readAt: string | null }) =>
        n.entityId === dueSoonReturnId && !n.readAt,
    );
    const before = await request(app.getHttpServer())
      .get('/v1/notifications/unread-count')
      .set(auth(firmAdminToken))
      .expect(200);

    const read = await request(app.getHttpServer())
      .post(`/v1/notifications/${target.id}/read`)
      .set(auth(firmAdminToken))
      .expect(201);
    expect(read.body.readAt).toBeTruthy();

    const after = await request(app.getHttpServer())
      .get('/v1/notifications/unread-count')
      .set(auth(firmAdminToken))
      .expect(200);
    expect(after.body.count).toBe(before.body.count - 1);
  });

  it('marks all notifications read', async () => {
    await request(app.getHttpServer())
      .post('/v1/notifications/read-all')
      .set(auth(firmAdminToken))
      .expect(201);
    const after = await request(app.getHttpServer())
      .get('/v1/notifications/unread-count')
      .set(auth(firmAdminToken))
      .expect(200);
    expect(after.body.count).toBe(0);
  });

  it('a super admin cannot read a firm notification via the scoped feed', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/notifications')
      .set(auth(superToken))
      .expect(200);
    expect(res.body.items).toHaveLength(0);
  });

  it('a firm admin cannot mark a foreign or unknown notification read', async () => {
    await request(app.getHttpServer())
      .post('/v1/notifications/does-not-exist/read')
      .set(auth(firmAdminToken))
      .expect(404);
  });
});
