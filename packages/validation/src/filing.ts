import { z } from 'zod';
import { periodSchema } from './common';

export const returnTypeSchema = z.enum(['GSTR1', 'GSTR3B', 'GSTR9', 'OTHER']);
export const filingStatusSchema = z.enum(['PENDING', 'IN_REVIEW', 'FILED', 'REJECTED']);

export const createReturnSchema = z.object({
  clientId: z.string().min(1),
  type: returnTypeSchema,
  period: periodSchema,
  dueDate: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
  status: filingStatusSchema.optional(),
});

export const createFilingSchema = z.object({
  clientId: z.string().min(1),
  returnId: z.string().optional(),
  type: returnTypeSchema,
  period: periodSchema,
  referenceNo: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});

export const updateFilingStatusSchema = z.object({
  status: filingStatusSchema,
  referenceNo: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});

export const createInvoiceSchema = z.object({
  clientId: z.string().min(1),
  smsMessageId: z.string().optional(),
  invoiceNo: z.string().max(80).optional(),
  invoiceDate: z.string().datetime().optional(),
  counterpartyGstin: z.string().max(20).optional(),
  taxableValue: z.coerce.number().nonnegative().optional(),
  taxAmount: z.coerce.number().nonnegative().optional(),
  totalAmount: z.coerce.number().nonnegative().optional(),
});
