import { z } from 'zod';

export const billingInvoiceStatusSchema = z.enum([
  'DRAFT',
  'ISSUED',
  'PARTIAL',
  'PAID',
  'VOID',
]);

export const billingInvoiceTypeSchema = z.enum([
  'PER_FILING',
  'CUMULATIVE',
  'SUBSCRIPTION',
]);

export const billingCycleSchema = z.enum([
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
]);

export const billingInvoiceItemSchema = z.object({
  filingId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).max(500),
  amount: z.coerce.number().min(0).max(10_000_000),
});

export const createBillingInvoiceSchema = z.object({
  clientId: z.string().trim().min(1),
  type: billingInvoiceTypeSchema.optional(),
  issueDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
  items: z.array(billingInvoiceItemSchema).min(1).max(200),
});

export const updateBillingInvoiceSchema = z.object({
  dueDate: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(['DRAFT', 'ISSUED', 'VOID']).optional(),
});

export const listBillingInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  clientId: z.string().optional(),
  status: billingInvoiceStatusSchema.optional(),
  type: billingInvoiceTypeSchema.optional(),
});

export const createSubscriptionSchema = z.object({
  clientId: z.string().trim().min(1),
  amount: z.coerce.number().positive().max(10_000_000),
  cycle: billingCycleSchema.optional(),
  startDate: z.string().datetime().optional(),
  nextDueDate: z.string().datetime().optional(),
  active: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const updateSubscriptionSchema = z.object({
  amount: z.coerce.number().positive().max(10_000_000).optional(),
  cycle: billingCycleSchema.optional(),
  nextDueDate: z.string().datetime().optional(),
  active: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const createPaymentRequestSchema = z
  .object({
    clientId: z.string().trim().min(1).optional(),
    invoiceId: z.string().trim().min(1).optional(),
    filingId: z.string().trim().min(1).optional(),
    amount: z.coerce.number().positive().max(10_000_000),
    description: z.string().trim().max(500).optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .refine((data) => Boolean(data.clientId || data.invoiceId || data.filingId), {
    message: 'clientId, invoiceId or filingId is required',
  });

export const listPaymentRequestsQuerySchema = z.object({
  clientId: z.string().optional(),
  invoiceId: z.string().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']).optional(),
});

export type CreateBillingInvoiceInput = z.infer<typeof createBillingInvoiceSchema>;
export type UpdateBillingInvoiceInput = z.infer<typeof updateBillingInvoiceSchema>;
export type ListBillingInvoicesQuery = z.infer<typeof listBillingInvoicesQuerySchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type CreatePaymentRequestInput = z.infer<typeof createPaymentRequestSchema>;
export type ListPaymentRequestsQuery = z.infer<typeof listPaymentRequestsQuerySchema>;
