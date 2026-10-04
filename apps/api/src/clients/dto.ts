import { z } from 'zod';
import { createClientSchema, updateClientSchema } from '@gstflow/validation';

export const createClientExtendedSchema = createClientSchema.extend({
  firmId: z.string().min(1).optional(),
  note: z.string().trim().max(500).optional(),
});

export const listClientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(200).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  linkStatus: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'REVOKED']).optional(),
  firmId: z.string().min(1).optional(),
});

export { updateClientSchema, requestClientLinkSchema } from '@gstflow/validation';

export type CreateClientDto = z.infer<typeof createClientExtendedSchema>;
export type UpdateClientDto = z.infer<typeof updateClientSchema>;
export type ListClientsQueryDto = z.infer<typeof listClientsQuerySchema>;
