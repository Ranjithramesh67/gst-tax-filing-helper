import { z } from 'zod';

export const otpIngestItemSchema = z.object({
  code: z.string().min(3).max(12),
  source: z.literal('EMAIL'),
  fromAddress: z.string().max(320).optional(),
  subject: z.string().max(500).optional(),
  snippet: z.string().max(400).optional(),
  receivedAt: z.string().datetime(),
  deviceId: z.string().optional(),
  sourceRef: z.string().min(4).max(200),
});

export const otpIngestSchema = z.object({
  items: z.array(otpIngestItemSchema).min(1).max(200),
});
