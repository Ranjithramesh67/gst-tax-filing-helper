import { z } from 'zod';

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
export const PHONE_REGEX = /^(\+91)?[6-9][0-9]{9}$/;

export const idSchema = z.string().min(1, 'id is required');
export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(GSTIN_REGEX, 'Invalid GSTIN');
export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(PAN_REGEX, 'Invalid PAN');
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ''))
  .refine((v) => PHONE_REGEX.test(v), 'Invalid Indian mobile number');

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(100).optional(),
});

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128);

export const periodSchema = z
  .string()
  .regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, 'Period must be YYYY-MM');

export const roleSchema = z.enum(['SUPER_ADMIN', 'FIRM_ADMIN', 'FILER', 'CLIENT']);
