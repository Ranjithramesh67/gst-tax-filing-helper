import { z } from 'zod';
import { deviceRegisterSchema } from '@gstflow/validation';

export const listDevicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  clientId: z.string().min(1).optional(),
  revoked: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
});

export type ListDevicesQuery = z.infer<typeof listDevicesQuerySchema>;

export const deviceRegisterBodySchema = deviceRegisterSchema.extend({
  clientId: z.string().min(1).optional(),
});

export type DeviceRegisterBodyInput = z.infer<typeof deviceRegisterBodySchema>;
