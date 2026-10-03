import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, OtpPurpose } from '@gstflow/types';
import type { DeviceRegisterBody, OtpVerifyResponse } from '@gstflow/types';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { AuditService } from '../common/audit/audit.service';
import { CONSENT_VERSION } from '../common/constants';
import type { Actor } from '../common/auth/actor.types';
import { actorToPayload, type TokenPair } from './auth.types';

export interface OtpRequestResult {
  requestId: string;
  expiresIn: number;
  devCode?: string;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private get ttlSeconds(): number {
    return Number(this.config.get<string>('OTP_TTL_SECONDS') ?? 300);
  }

  private get codeLength(): number {
    return Number(this.config.get<string>('OTP_LENGTH') ?? 6);
  }

  async request(phone: string, purpose: OtpPurpose, clientId?: string): Promise<OtpRequestResult> {
    const code = this.crypto.otpCode(this.codeLength);
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    const record = await this.prisma.otpVerification.create({
      data: {
        phone,
        purpose,
        codeHash: this.crypto.hash(code),
        expiresAt,
      },
    });

    await this.audit.record({
      action: 'otp.request',
      entity: 'OtpVerification',
      entityId: record.id,
      meta: { phone, purpose, clientId: clientId ?? null },
    });

    this.logger.log(`OTP for ${phone} (${purpose}): ${code}`);
    const echo = this.config.get<string>('OTP_DEV_ECHO') === 'true';
    return { requestId: record.id, expiresIn: this.ttlSeconds, ...(echo ? { devCode: code } : {}) };
  }

  async consume(phone: string, code: string, purpose: OtpPurpose): Promise<void> {
    const record = await this.prisma.otpVerification.findFirst({
      where: { phone, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new BadRequestException('No pending OTP for this number');
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('OTP expired, please request a new one');
    }
    if (record.attempts >= 5) {
      throw new BadRequestException('Too many attempts, please request a new OTP');
    }

    const matches = record.codeHash === this.crypto.hash(code);
    if (!matches) {
      await this.prisma.otpVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid OTP');
    }

    await this.prisma.otpVerification.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
  }
}

export interface VerifyOtpContext {
  phone: string;
  code: string;
  purpose: OtpPurpose;
  device?: DeviceRegisterBody;
  ip?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
  ) {}

  private get accessTtl(): number {
    return Number(this.config.get<string>('JWT_ACCESS_TTL') ?? 900);
  }
  private get refreshTtl(): number {
    return Number(this.config.get<string>('JWT_REFRESH_TTL') ?? 604800);
  }

  async login(
    email: string,
    password: string,
    ip?: string,
    firmSlug?: string,
  ): Promise<{ tokens: TokenPair; actor: Actor }> {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { firm: true } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    if (firmSlug && user.role !== Role.SUPER_ADMIN) {
      const userSlug = user.firm?.slug?.toLowerCase();
      if (!userSlug || userSlug !== firmSlug.toLowerCase()) {
        throw new UnauthorizedException('Invalid firm or credentials');
      }
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const actor: Actor = {
      userId: user.id,
      role: user.role,
      firmId: user.firmId,
      clientId: null,
      email: user.email,
      name: user.name,
    };
    const tokens = await this.issueTokens(actor);
    await this.audit.record({
      actorId: user.id,
      firmId: user.firmId,
      action: 'auth.login',
      entity: 'User',
      entityId: user.id,
      ip,
    });
    return { tokens, actor };
  }

  async verifyOtp(ctx: VerifyOtpContext): Promise<OtpVerifyResponse> {
    await this.otp.consume(ctx.phone, ctx.code, ctx.purpose);

    const client = await this.prisma.client.findFirst({
      where: { phone: ctx.phone, status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'asc' },
    });
    if (!client) {
      throw new UnauthorizedException('No client is registered with this number');
    }

    let deviceId: string | null = null;
    let deviceResult: OtpVerifyResponse['device'];
    if (ctx.device) {
      const device = await this.prisma.device.upsert({
        where: { clientId_androidId: { clientId: client.id, androidId: ctx.device.androidId } },
        create: {
          clientId: client.id,
          androidId: ctx.device.androidId,
          platform: ctx.device.platform,
          model: ctx.device.model,
          osVersion: ctx.device.osVersion,
          appVersion: ctx.device.appVersion,
          pushToken: ctx.device.pushToken,
          lastSeenAt: new Date(),
          revoked: false,
        },
        update: {
          platform: ctx.device.platform,
          model: ctx.device.model,
          osVersion: ctx.device.osVersion,
          appVersion: ctx.device.appVersion,
          pushToken: ctx.device.pushToken,
          lastSeenAt: new Date(),
          revoked: false,
        },
      });
      deviceId = device.id;
      deviceResult = {
        id: device.id,
        clientId: device.clientId,
        platform: device.platform,
        androidId: device.androidId,
        model: device.model,
        osVersion: device.osVersion,
        appVersion: device.appVersion,
        revoked: device.revoked,
        lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
        createdAt: device.createdAt.toISOString(),
      };
    }

    const consent = await this.prisma.consentRecord.create({
      data: {
        clientId: client.id,
        deviceId,
        version: CONSENT_VERSION,
        otpVerified: true,
        ip: ctx.ip ?? null,
      },
    });

    await this.prisma.client.update({
      where: { id: client.id },
      data: { consentGranted: true },
    });

    const actor: Actor = {
      userId: client.id,
      role: Role.CLIENT,
      firmId: client.firmId,
      clientId: client.id,
      name: client.name,
      email: client.email ?? undefined,
    };
    const tokens = await this.issueTokens(actor);

    await this.audit.record({
      firmId: client.firmId,
      action: 'auth.otp_verified',
      entity: 'Client',
      entityId: client.id,
      meta: { deviceId, purpose: ctx.purpose },
      ip: ctx.ip,
    });

    return {
      ...tokens,
      client: serialiseClient(client),
      consent: serialiseConsent(consent),
      device: deviceResult,
    };
  }

  async issueTokens(actor: Actor): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(actorToPayload(actor), {
      expiresIn: this.accessTtl,
    });
    const refreshToken = randomBytes(48).toString('hex');
    const isClient = actor.role === Role.CLIENT;
    await this.prisma.refreshToken.create({
      data: {
        userId: isClient ? null : actor.userId,
        clientId: isClient ? actor.clientId ?? actor.userId : null,
        tokenHash: this.crypto.hash(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
      },
    });
    return { accessToken, refreshToken, expiresIn: this.accessTtl };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const hash = this.crypto.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = stored.userId
      ? await this.prisma.user.findUnique({ where: { id: stored.userId } })
      : null;
    let actor: Actor;
    if (user) {
      actor = {
        userId: user.id,
        role: user.role,
        firmId: user.firmId,
        clientId: null,
        email: user.email,
        name: user.name,
      };
    } else {
      const client = stored.clientId
        ? await this.prisma.client.findUnique({ where: { id: stored.clientId } })
        : null;
      if (!client) throw new UnauthorizedException('Invalid refresh token');
      actor = {
        userId: client.id,
        role: Role.CLIENT,
        firmId: client.firmId,
        clientId: client.id,
        name: client.name,
      };
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(actor);
  }

  async logout(refreshToken: string): Promise<{ success: boolean }> {
    const hash = this.crypto.hash(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async me(actor: Actor): Promise<{ id: string; role: Role; firmId: string | null; clientId: string | null; email?: string; name?: string }> {
    if (actor.role === Role.CLIENT) {
      const client = await this.prisma.client.findUnique({ where: { id: actor.userId } });
      if (!client) throw new UnauthorizedException('Client not found');
      return {
        id: client.id,
        role: Role.CLIENT,
        firmId: client.firmId,
        clientId: client.id,
        email: client.email ?? undefined,
        name: client.name,
      };
    }
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return {
      id: user.id,
      role: user.role,
      firmId: user.firmId,
      clientId: null,
      email: user.email,
      name: user.name,
    };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}

// --- serialisers keep the API shape aligned with @gstflow/types (ISO strings) ---

function serialiseClient(client: {
  id: string;
  firmId: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string;
  address: string | null;
  stateCode: string | null;
  status: string;
  consentGranted: boolean;
  lastSmsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): OtpVerifyResponse['client'] {
  return {
    ...client,
    status: client.status as never,
    lastSmsAt: client.lastSmsAt?.toISOString() ?? null,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}

function serialiseConsent(consent: {
  id: string;
  clientId: string;
  deviceId: string | null;
  version: string;
  acceptedAt: Date;
  ip: string | null;
  otpVerified: boolean;
  revokedAt: Date | null;
}): NonNullable<OtpVerifyResponse['consent']> {
  return {
    ...consent,
    acceptedAt: consent.acceptedAt.toISOString(),
    revokedAt: consent.revokedAt?.toISOString() ?? null,
  };
}
