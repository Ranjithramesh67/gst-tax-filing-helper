import { buildPing4SmsRequest, maskSecret, renderSmsMessage } from './sms-provider.util';

describe('renderSmsMessage', () => {
  const context = { code: '445566', appName: 'GSTFlow' };

  it('replaces DLT-style app name and variable tokens', () => {
    const template =
      'Hi, Your OTP to Login into {{app name}} App is {{variable}}. Do not share it.';
    expect(renderSmsMessage(template, context)).toBe(
      'Hi, Your OTP to Login into GSTFlow App is 445566. Do not share it.',
    );
  });

  it('supports otp/code/app_name aliases and custom variables', () => {
    const template = '{{app_name}} code {{otp}} / {{CODE}} from {{team}}';
    expect(
      renderSmsMessage(template, { ...context, variables: { team: 'Keera' } }),
    ).toBe('GSTFlow code 445566 / 445566 from Keera');
  });

  it('leaves unknown tokens untouched', () => {
    expect(renderSmsMessage('Hello {{missing}}', context)).toBe('Hello {{missing}}');
  });
});

describe('buildPing4SmsRequest', () => {
  it('maps fields onto the ping4sms query contract', () => {
    const request = buildPing4SmsRequest({
      url: 'http://site.ping4sms.com/api/smsapi',
      method: 'GET',
      sender: 'VHOMEE',
      route: '4',
      templateId: '1207170351303889084',
      header: null,
      message: 'hello',
      credentials: { key: 'secret' },
      phone: '9876543210',
    });
    expect(request.query).toEqual({
      key: 'secret',
      sender: 'VHOMEE',
      number: '9876543210',
      sms: 'hello',
      route: '4',
      templateid: '1207170351303889084',
    });
  });

  it('falls back to the header for the sender id', () => {
    const request = buildPing4SmsRequest({
      url: 'http://x',
      method: 'GET',
      sender: '',
      route: null,
      templateId: null,
      header: 'VHOMEE',
      message: 'm',
      credentials: { key: 'k' },
      phone: '9',
    });
    expect(request.query.sender).toBe('VHOMEE');
    expect(request.query.route).toBeUndefined();
  });
});

describe('maskSecret', () => {
  it('masks the middle of a secret', () => {
    expect(maskSecret('dd148e5b87da3')).toBe('dd14******da3');
  });
});
