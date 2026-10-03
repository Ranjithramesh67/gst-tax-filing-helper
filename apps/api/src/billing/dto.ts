import { z } from 'zod';
import {
  createBillingInvoiceSchema,
  updateBillingInvoiceSchema,
  listBillingInvoicesQuerySchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
  createPaymentRequestSchema,
  listPaymentRequestsQuerySchema,
} from '@gstflow/validation';

export type CreateBillingInvoiceInput = z.infer<typeof createBillingInvoiceSchema>;
export type UpdateBillingInvoiceInput = z.infer<typeof updateBillingInvoiceSchema>;
export type ListBillingInvoicesQuery = z.infer<typeof listBillingInvoicesQuerySchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type CreatePaymentRequestInput = z.infer<typeof createPaymentRequestSchema>;
export type ListPaymentRequestsQuery = z.infer<typeof listPaymentRequestsQuerySchema>;
