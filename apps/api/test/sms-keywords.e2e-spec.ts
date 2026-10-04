import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { assertDatabaseReachable } from './setup';

const SEEDED = {
  superAdmin: { email: 'superadmin@gstflow.local', password: 'Admin@12345' },
  firmAdmin: { email: 'admin@sharma.local', password: 'Firm@12345' },
} as const;

describe('SMS keyword whitelist and viewer (e2e)', () => {
  let app: INestApplication;
  let superToken: string;
  let firmToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await assertDatabaseReachable();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    superToken = (
      await request(app.getHttpServer()).post('/v1/auth/login').send(SEEDED.superAdmin)
    ).body.accessToken;
    firmToken = (
      await request(app.getHttpServer()).post('/v1/auth/login').send(SEEDED.firmAdmin)
    ).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('guards the keyword config behind super admin', async () => {
    await request(app.getHttpServer()).get('/v1/admin/settings/sms-keywords').expect(401);
    await request(app.getHttpServer())
      .get('/v1/admin/settings/sms-keywords')
      .set(auth(firmToken))
      .expect(403);
  });

  it('reads and updates the keyword whitelist', async () => {
    const current = await request(app.getHttpServer())
      .get('/v1/admin/settings/sms-keywords')
      .set(auth(superToken))
      .expect(200);
    expect(Array.isArray(current.body.bodyKeywords)).toBe(true);
    expect(Array.isArray(current.body.headerKeywords)).toBe(true);
    expect(typeof current.body.hideAfterForward).toBe('boolean');

    const updated = await request(app.getHttpServer())
      .put('/v1/admin/settings/sms-keywords')
      .set(auth(superToken))
      .send({
        bodyKeywords: ['gst', ' GST ', 'arn'],
        headerKeywords: ['GSTN'],
        hideAfterForward: true,
      })
      .expect(200);

    expect(updated.body.bodyKeywords).toEqual(['gst', 'arn']);
    expect(updated.body.headerKeywords).toEqual(['GSTN']);
    expect(updated.body.hideAfterForward).toBe(true);
  });

  it('rejects a malformed keyword payload', async () => {
    await request(app.getHttpServer())
      .put('/v1/admin/settings/sms-keywords')
      .set(auth(superToken))
      .send({ bodyKeywords: 'gst', headerKeywords: [], hideAfterForward: false })
      .expect(400);
  });

  it('exposes the keyword config publicly for devices', async () => {
    const response = await request(app.getHttpServer()).get('/v1/public/sms-keywords').expect(200);
    expect(Array.isArray(response.body.bodyKeywords)).toBe(true);
    expect(typeof response.body.hideAfterForward).toBe('boolean');
  });

  it('lets a super admin browse messages across firms', async () => {
    await request(app.getHttpServer()).get('/v1/admin/sms').expect(401);
    await request(app.getHttpServer()).get('/v1/admin/sms').set(auth(firmToken)).expect(403);

    const response = await request(app.getHttpServer())
      .get('/v1/admin/sms')
      .set(auth(superToken))
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        items: expect.any(Array),
        total: expect.any(Number),
        page: expect.any(Number),
        pageSize: expect.any(Number),
      }),
    );
  });
});
