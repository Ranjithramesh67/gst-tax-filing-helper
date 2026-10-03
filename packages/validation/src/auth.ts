import { z } from 'zod';
import { phoneSchema } from './common';

export const otpPurposeSchema = z.enum(['CLIENT_ONBOARDING', 'DEVICE_PAIRING', 'LOGIN']);

export const deviceRegisterSchema = z.object({
  androidId: z.string().min(4).max(128),
  platform: z.enum(['ANDROID', 'IOS']),
  model: z.string().max(120).optional(),
  osVersion: z.string().max(40).optional(),
  appVersion: z.string().max(40).optional(),
  pushToken: z.string().max(512).optional(),
});

export const otpRequestSchema = z.object({
  phone: phoneSchema,
  purpose: otpPurposeSchema,
  clientId: z.string().optional(),
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^[0-9]{4,8}$/, 'Invalid OTP code'),
  purpose: otpPurposeSchema,
  device: deviceRegisterSchema.optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  firmSlug: z.string().trim().toLowerCase().max(60).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
