import { z } from 'zod';
import { gstinSchema, passwordSchema, phoneSchema, roleSchema } from './common';

const brandColorSchema = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex color like #0F766E')
  .optional();
const logoUrlSchema = z.string().trim().url().max(2048).optional();
const feeSchema = z.coerce.number().nonnegative().max(1_000_000).optional();

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
  logoUrl: logoUrlSchema,
  brandColor: brandColorSchema,
  supportEmail: z.string().email().optional(),
  supportPhone: phoneSchema.optional(),
  address: z.string().max(500).optional(),
  defaultFilingFee: feeSchema,
});

export const updateFirmSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{2,60}$/)
    .optional(),
  gstin: gstinSchema.optional(),
  email: z.string().email().optional(),
  phone: phoneSchema.optional(),
  logoUrl: logoUrlSchema,
  brandColor: brandColorSchema,
  supportEmail: z.string().email().optional(),
  supportPhone: phoneSchema.optional(),
  address: z.string().max(500).optional(),
  defaultFilingFee: feeSchema,
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional(),
});

const nullableBrandColorSchema = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex color like #0F766E')
  .nullable()
  .optional();

/**
 * Firm-admin self-service profile update. Slug and status are deliberately
 * excluded: firm URLs are immutable and platform status is super-admin only.
 */
export const updateFirmSettingsSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  gstin: gstinSchema.nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  logoUrl: z.string().trim().url().max(2048).nullable().optional(),
  brandColor: nullableBrandColorSchema,
  supportEmail: z.string().email().nullable().optional(),
  supportPhone: phoneSchema.nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  defaultFilingFee: z.coerce.number().nonnegative().max(1_000_000).nullable().optional(),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().email(),
  password: passwordSchema,
  role: roleSchema.optional(),
  roleId: z.string().trim().min(1).optional(),
  phone: phoneSchema.optional(),
  firmId: z.string().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  phone: phoneSchema.optional(),
  role: roleSchema.optional(),
  roleId: z.string().trim().min(1).optional(),
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
