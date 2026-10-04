import { ConfigService } from '@nestjs/config';

import { OtpPurpose } from '@gstflow/types';

import { OtpService } from './auth.service';

describe('OtpService outbound SMS', () => {
  function build(
    configValues: Record<string, string>,
    sendOtp = jest.fn().mockResolvedValue({ ok: true, status: 200 }),
  ) {
    const prisma = {
      otpVerification: { create: jest.fn().mockResolvedValue({ id: 'otp-1' }) },
    };
    const crypto = {
      otpCode: jest.fn().mockReturnValue('654321'),
      hash: jest.fn().mockReturnValue('hashed'),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const gateway = { sendOtp };
    const service = new OtpService(
      prisma as never,
      crypto as never,
      new ConfigService(configValues),
      audit as never,
      gateway as never,
    );
    return { service, gateway };
  }

  it('sends the generated code through the gateway on request', async () => {
    const sendOtp = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const { service } = build({ OTP_DEV_ECHO: 'false' }, sendOtp);

    await service.request('9999999999', OtpPurpose.LOGIN);

    expect(sendOtp).toHaveBeenCalledTimes(1);
    expect(sendOtp).toHaveBeenCalledWith('9999999999', '654321');
  });

  it('still resolves when gateway delivery fails', async () => {
    const sendOtp = jest.fn().mockResolvedValue({ ok: false, status: 502 });
    const { service } = build({ OTP_DEV_ECHO: 'false' }, sendOtp);

    await expect(service.request('9999999999', OtpPurpose.LOGIN)).resolves.toMatchObject({
      requestId: 'otp-1',
    });
  });

  it('echoes the code only when OTP_DEV_ECHO is true', async () => {
    const { service } = build({ OTP_DEV_ECHO: 'true' });
    const result = await service.request('9999999999', OtpPurpose.LOGIN);
    expect(result.devCode).toBe('654321');
  });
});
