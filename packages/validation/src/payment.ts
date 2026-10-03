import { z } from 'zod';

export const paymentStatusSchema = z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']);
export const paymentMethodSchema = z.enum([
  'CASH',
  'UPI',
  'BANK_TRANSFER',
  'CHEQUE',
  'CARD',
  'OTHER',
]);

export const createPaymentSchema = z.object({
  amount: z.coerce.number().positive().max(10_000_000),
  status: paymentStatusSchema.optional(),
  method: paymentMethodSchema.optional(),
  paidAt: z.string().datetime().optional(),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const updatePaymentSchema = z.object({
  amount: z.coerce.number().positive().max(10_000_000).optional(),
  status: paymentStatusSchema.optional(),
  method: paymentMethodSchema.optional(),
  paidAt: z.string().datetime().optional(),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const paymentLinkSchema = z.object({
  label: z.string().trim().min(1).max(100),
  url: z.string().trim().url().max(2048),
});

export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  clientId: z.string().optional(),
  filingId: z.string().optional(),
  status: paymentStatusSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
