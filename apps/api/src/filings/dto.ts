import { z } from 'zod';
import {
  createFilingSchema,
  createInvoiceSchema,
  createReturnSchema,
  filingStatusSchema,
  returnTypeSchema,
  updateFilingSchema,
  updateFilingStatusSchema,
} from '@gstflow/validation';
import type { FilingStatus } from '@gstflow/types';

export const invoicesQuerySchema = z.object({
  clientId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const returnsQuerySchema = invoicesQuerySchema.extend({
  status: filingStatusSchema.optional(),
  type: returnTypeSchema.optional(),
});

export const filingsQuerySchema = invoicesQuerySchema.extend({
  status: filingStatusSchema.optional(),
  type: returnTypeSchema.optional(),
});

export type InvoicesQuery = z.infer<typeof invoicesQuerySchema>;
export type ReturnsQuery = z.infer<typeof returnsQuerySchema>;
export type FilingsQuery = z.infer<typeof filingsQuerySchema>;

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type CreateReturnInput = z.infer<typeof createReturnSchema>;
export type CreateFilingInput = z.infer<typeof createFilingSchema> & { status?: FilingStatus };
export type UpdateFilingStatusInput = z.infer<typeof updateFilingStatusSchema>;
export type UpdateFilingInput = z.infer<typeof updateFilingSchema>;
