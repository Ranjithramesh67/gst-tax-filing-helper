import { ConfigService } from '@nestjs/config';

import { SmsGatewayService } from './sms-gateway.service';
import type { SmsProviderConfigService } from './sms-provider-config.service';

function config(values: Record<string, string>): ConfigService {
  return new ConfigService(values);
}

function noProviders(): SmsProviderConfigService {
  return { getActiveResolved: async () => null } as unknown as SmsProviderConfigService;
}

describe('SmsGatewayService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips without calling fetch when disabled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new SmsGatewayService(config({ SMS_GATEWAY_ENABLED: 'false' }), noProviders());

    await expect(service.sendOtp('9999999999', '123456')).resolves.toEqual({
      ok: false,
      skipped: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skips when enabled but no key is configured', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new SmsGatewayService(config({ SMS_GATEWAY_ENABLED: 'true' }), noProviders());

    await expect(service.sendOtp('9999999999', '123456')).resolves.toEqual({
      ok: false,
      skipped: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the OTP template with the expected query params', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    const service = new SmsGatewayService(
      config({ SMS_GATEWAY_ENABLED: 'true', SMS_GATEWAY_KEY: 'test-key' }),
      noProviders(),
    );

    const result = await service.sendOtp('9876543210', '112233');
    expect(result).toEqual({ ok: true, status: 200 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const requestUrl = new URL(fetchSpy.mock.calls[0]![0] as string);
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe('http://site.ping4sms.com/api/smsapi');
    expect(requestUrl.searchParams.get('key')).toBe('test-key');
    expect(requestUrl.searchParams.get('sender')).toBe('VHOMEE');
    expect(requestUrl.searchParams.get('number')).toBe('9876543210');
    expect(requestUrl.searchParams.get('route')).toBe('4');
    expect(requestUrl.searchParams.get('templateid')).toBe('1207170351303889084');
    expect(requestUrl.searchParams.get('sms')).toBe(service.buildOtpMessage('GSTFlow', '112233'));
  });

  it('reports a non-2xx response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
    const service = new SmsGatewayService(
      config({ SMS_GATEWAY_ENABLED: 'true', SMS_GATEWAY_KEY: 'k' }),
      noProviders(),
    );

    await expect(service.sendOtp('9', '1')).resolves.toEqual({ ok: false, status: 500 });
  });

  it('reports network errors without throwing', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('boom'));
    const service = new SmsGatewayService(
      config({ SMS_GATEWAY_ENABLED: 'true', SMS_GATEWAY_KEY: 'k' }),
      noProviders(),
    );

    const result = await service.sendOtp('9', '1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('builds the approved DLT message', () => {
    const service = new SmsGatewayService(config({}), noProviders());
    expect(service.buildOtpMessage('GSTFlow', '445566')).toBe(
      "Hi, Your OTP to Login into GSTFlow App is 445566. This OTP is sent by Ranji, " +
        "Please don't share this OTP with anyone. This OTP will expire in 2Mins.",
    );
  });

  it('prefers the active database provider over env config', async () => {
    const resolved = {
      id: 'p1',
      provider: 'PING4SMS',
      appName: 'GSTFlow',
      messageTemplate: 'Code {{variable}}',
      variables: null,
      timeoutMs: 1000,
      credentials: { key: 'db-key' },
      request: {
        url: 'http://example.test/send',
        method: 'GET',
        sender: 'HEADER',
        route: null,
        templateId: null,
        header: null,
        credentials: { key: 'db-key' },
      },
    };
    const sendResolved = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const providers = {
      getActiveResolved: async () => resolved,
      sendResolved,
    } as unknown as SmsProviderConfigService;
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new SmsGatewayService(
      config({ SMS_GATEWAY_ENABLED: 'true', SMS_GATEWAY_KEY: 'env-key' }),
      providers,
    );

    await expect(service.sendOtp('9876543210', '445566')).resolves.toEqual({ ok: true, status: 200 });
    expect(sendResolved).toHaveBeenCalledWith(resolved, '9876543210', '445566');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
