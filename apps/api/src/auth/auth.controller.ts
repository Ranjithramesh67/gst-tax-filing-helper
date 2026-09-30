import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
} from '@gstflow/validation';
import { OtpPurpose, Role } from '@gstflow/types';
import type { AuthResponse, AuthUser } from '@gstflow/types';

import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { Actor } from '../common/auth/actor.types';
import { AuthService, OtpService, type OtpRequestResult } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
  ) {}

  @Public()
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: { email: string; password: string },
    @Req() req: Request,
  ): Promise<AuthResponse> {
    const { tokens, actor } = await this.auth.login(body.email, body.password, ipOf(req));
    return { ...tokens, user: toAuthUser(actor) };
  }

  @Public()
  @Post('otp/request')
  async requestOtp(
    @Body(new ZodValidationPipe(otpRequestSchema))
    body: { phone: string; purpose: OtpPurpose; clientId?: string },
  ): Promise<OtpRequestResult> {
    return this.otp.request(body.phone, body.purpose, body.clientId);
  }

  @Public()
  @Post('otp/verify')
  async verifyOtp(
    @Body(new ZodValidationPipe(otpVerifySchema))
    body: {
      phone: string;
      code: string;
      purpose: OtpPurpose;
      device?: import('@gstflow/types').DeviceRegisterBody;
    },
    @Req() req: Request,
  ) {
    return this.auth.verifyOtp({
      phone: body.phone,
      code: body.code,
      purpose: body.purpose,
      device: body.device,
      ip: ipOf(req),
    });
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken: string },
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  async logout(@Body(new ZodValidationPipe(refreshSchema)) body: { refreshToken: string }) {
    return this.auth.logout(body.refreshToken);
  }

  @Get('me')
  async me(@CurrentUser() actor: Actor): Promise<AuthUser | { id: string; role: Role; name?: string }> {
    const me = await this.auth.me(actor);
    return me as unknown as AuthUser;
  }
}

function toAuthUser(actor: Actor): AuthUser {
  return {
    id: actor.userId,
    email: actor.email ?? '',
    name: actor.name ?? '',
    role: actor.role,
    firmId: actor.firmId,
  };
}

function ipOf(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return req.ip;
}
