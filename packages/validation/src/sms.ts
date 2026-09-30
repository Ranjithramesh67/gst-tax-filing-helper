import { z } from 'zod';

export const smsCategorySchema = z.enum([
  'GST_INVOICE',
  'GST_RETURN',
  'EWAY_BILL',
  'TAX_PAYMENT',
  'GST_NOTICE',
  'UNCLASSIFIED',
  'OTHER',
]);

export const smsIngestItemSchema = z.object({
  sender: z.string().min(1).max(64),
  body: z.string().min(1).max(4000),
  receivedAt: z.string().datetime(),
  deviceId: z.string().optional(),
  hash: z.string().min(8).max(128),
});

export const smsIngestSchema = z.object({
  items: z.array(smsIngestItemSchema).min(1).max(200),
});

export const classifySmsSchema = z.object({
  category: smsCategorySchema,
  status: z.enum(['RECEIVED', 'REVIEWED', 'FILED', 'IGNORED', 'FAILED']).optional(),
});
