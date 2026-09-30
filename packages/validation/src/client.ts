import { z } from 'zod';
import { gstinSchema, panSchema, phoneSchema } from './common';

export const createClientSchema = z.object({
  name: z.string().trim().min(2).max(200),
  phone: phoneSchema,
  gstin: gstinSchema.optional(),
  pan: panSchema.optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  stateCode: z.string().length(2).optional(),
});

export const updateClientSchema = createClientSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});
