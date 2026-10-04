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

const smsProviderKindSchema = z.enum(['PING4SMS']);
const smsMethodSchema = z.enum(['GET', 'POST']);
const smsCredentialsSchema = z.record(z.string().min(1).max(200));
const smsVariablesSchema = z.record(z.string().max(500));
const smsTimeoutSchema = z.coerce.number().int().min(1000).max(30000);

export const smsProviderInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  provider: smsProviderKindSchema.default('PING4SMS'),
  isActive: z.boolean().optional(),
  url: z.string().trim().url().max(500),
  method: smsMethodSchema.default('GET'),
  sender: z.string().trim().min(1).max(20),
  route: z.string().trim().max(20).optional(),
  templateId: z.string().trim().max(80).optional(),
  header: z.string().trim().max(80).optional(),
  credentials: smsCredentialsSchema.optional(),
  messageTemplate: z.string().trim().min(1).max(1000),
  appName: z.string().trim().min(1).max(60),
  variables: smsVariablesSchema.optional(),
  timeoutMs: smsTimeoutSchema.optional(),
});

export const updateSmsProviderSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  provider: smsProviderKindSchema.optional(),
  isActive: z.boolean().optional(),
  url: z.string().trim().url().max(500).optional(),
  method: smsMethodSchema.optional(),
  sender: z.string().trim().min(1).max(20).optional(),
  route: z.string().trim().max(20).optional(),
  templateId: z.string().trim().max(80).optional(),
  header: z.string().trim().max(80).optional(),
  credentials: smsCredentialsSchema.optional(),
  messageTemplate: z.string().trim().min(1).max(1000).optional(),
  appName: z.string().trim().min(1).max(60).optional(),
  variables: smsVariablesSchema.optional(),
  timeoutMs: smsTimeoutSchema.optional(),
});

export const smsTestSchema = z
  .object({
    numbers: z.array(z.string().trim().min(6).max(15)).min(1).max(25),
    code: z.string().trim().min(4).max(12).optional(),
    providerId: z.string().trim().min(1).optional(),
    config: updateSmsProviderSchema.optional(),
  })
  .refine((value) => Boolean(value.providerId) || Boolean(value.config), {
    message: 'Provide providerId or an inline config to test',
    path: ['providerId'],
  });

export const smsRetentionSchema = z
  .object({
    enabled: z.boolean(),
    archiveAfterDays: z.coerce.number().int().min(1).max(3650),
    purgeBackupAfterDays: z.coerce.number().int().min(1).max(3650),
  })
  .refine((value) => value.purgeBackupAfterDays >= value.archiveAfterDays, {
    message: 'purgeBackupAfterDays must be greater than or equal to archiveAfterDays',
    path: ['purgeBackupAfterDays'],
  });

const keywordItemSchema = z.string().trim().min(1).max(60);

export const smsKeywordSchema = z.object({
  bodyKeywords: z.array(keywordItemSchema).max(100),
  headerKeywords: z.array(keywordItemSchema).max(100),
  hideAfterForward: z.boolean(),
});

export const otpProvidersEnabledSchema = z
  .object({
    imap: z.boolean(),
    gmail: z.boolean(),
    graph: z.boolean(),
  })
  .strict();

export const otpSettingsSchema = z.object({
  groupWindowSeconds: z.coerce.number().int().min(30).max(3600),
  emailEnabled: z.boolean(),
  providersEnabled: otpProvidersEnabledSchema,
});
