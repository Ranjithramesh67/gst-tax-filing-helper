import { z } from 'zod';
import {
  createFirmSchema,
  createReleaseSchema,
  createUserSchema,
  roleSchema,
  smsCategorySchema,
  smsProviderInputSchema,
  smsTestSchema,
  updateFirmSchema,
  updateSmsProviderSchema,
  updateUserSchema,
} from '@gstflow/validation';

export type CreateFirmInput = z.infer<typeof createFirmSchema>;
export type UpdateFirmInput = z.infer<typeof updateFirmSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateReleaseInput = z.infer<typeof createReleaseSchema>;
export type CreateSmsProviderInput = z.infer<typeof smsProviderInputSchema>;
export type UpdateSmsProviderInput = z.infer<typeof updateSmsProviderSchema>;
export type TestSmsProviderInput = z.infer<typeof smsTestSchema>;

const pageField = z.coerce.number().int().min(1).default(1);
const pageSizeField = z.coerce.number().int().min(1).max(200).default(25);

const firmStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']);
const releasePlatformSchema = z.enum(['ANDROID', 'IOS']);
const releaseChannelSchema = z.enum(['STABLE', 'BETA']);

export const listFirmsQuerySchema = z.object({
  page: pageField,
  pageSize: pageSizeField,
  search: z.string().trim().max(200).optional(),
  status: firmStatusSchema.optional(),
});

export const listUsersQuerySchema = z.object({
  page: pageField,
  pageSize: pageSizeField,
  search: z.string().trim().max(200).optional(),
  role: roleSchema.optional(),
  firmId: z.string().trim().min(1).optional(),
});

export const listReleasesQuerySchema = z.object({
  page: pageField,
  pageSize: pageSizeField,
  platform: releasePlatformSchema.optional(),
  channel: releaseChannelSchema.optional(),
});

export const listAuditQuerySchema = z.object({
  page: pageField,
  pageSize: pageSizeField,
  firmId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  entity: z.string().trim().min(1).max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ListFirmsQuery = z.infer<typeof listFirmsQuerySchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type ListReleasesQuery = z.infer<typeof listReleasesQuerySchema>;
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

export const listSmsQuerySchema = z.object({
  page: pageField,
  pageSize: pageSizeField,
  firmId: z.string().trim().min(1).optional(),
  clientId: z.string().trim().min(1).optional(),
  search: z.string().trim().max(200).optional(),
  category: smsCategorySchema.optional(),
  status: z.enum(['RECEIVED', 'REVIEWED', 'FILED', 'IGNORED', 'FAILED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ListSmsQuery = z.infer<typeof listSmsQuerySchema>;
