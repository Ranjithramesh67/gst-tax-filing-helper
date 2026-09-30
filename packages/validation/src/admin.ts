import { z } from 'zod';
import { gstinSchema, passwordSchema, phoneSchema, roleSchema } from './common';

export const createFirmSchema = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/)
    .optional(),
  gstin: gstinSchema.optional(),
  email: z.string().email().optional(),
  phone: phoneSchema.optional(),
});

export const updateFirmSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  gstin: gstinSchema.optional(),
  email: z.string().email().optional(),
  phone: phoneSchema.optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional(),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().email(),
  password: passwordSchema,
  role: roleSchema,
  phone: phoneSchema.optional(),
  firmId: z.string().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  phone: phoneSchema.optional(),
  role: roleSchema.optional(),
  isActive: z.boolean().optional(),
});

export const createReleaseSchema = z.object({
  platform: z.enum(['ANDROID', 'IOS']),
  version: z.string().min(1).max(40),
  versionCode: z.coerce.number().int().nonnegative(),
  channel: z.enum(['STABLE', 'BETA']),
  url: z.string().url(),
  checksum: z.string().max(200).optional(),
  changelog: z.string().max(4000).optional(),
  mandatory: z.boolean().optional(),
});
