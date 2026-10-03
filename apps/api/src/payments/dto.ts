import { z } from 'zod';
import {
  createPaymentSchema,
  updatePaymentSchema,
  paymentLinkSchema,
  listPaymentsQuerySchema,
} from '@gstflow/validation';

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type PaymentLinkInput = z.infer<typeof paymentLinkSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
