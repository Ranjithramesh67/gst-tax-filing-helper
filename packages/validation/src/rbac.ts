import { z } from 'zod';
import { listQuerySchema, passwordSchema } from './common';

export const roleKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,40}$/, 'Key must be uppercase letters, digits or underscore');

export const createRoleSchema = z.object({
  key: roleKeySchema,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  scope: z.enum(['SYSTEM', 'FIRM']).optional(),
  firmId: z.string().trim().min(1).optional(),
  permissions: z.array(z.string()).default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).optional(),
  permissions: z.array(z.string()).optional(),
});

export const assignRoleSchema = z.object({
  roleId: z.string().trim().min(1),
});

export const listRolesQuerySchema = listQuerySchema.extend({
  scope: z.enum(['SYSTEM', 'FIRM']).optional(),
  firmId: z.string().trim().min(1).optional(),
});

export const createTeamMemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: passwordSchema,
  roleId: z.string().trim().min(1).optional(),
  role: z.enum(['FIRM_ADMIN', 'FILER']).optional(),
  phone: z.string().trim().max(20).optional(),
});

export const updateTeamMemberSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  roleId: z.string().trim().min(1).optional(),
  role: z.enum(['FIRM_ADMIN', 'FILER']).optional(),
  isActive: z.boolean().optional(),
});

export const listTeamQuerySchema = listQuerySchema;
