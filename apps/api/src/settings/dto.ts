import { z } from 'zod';
import { smsRetentionSchema } from '@gstflow/validation';

export type UpdateSmsRetentionInput = z.infer<typeof smsRetentionSchema>;

export { smsRetentionSchema };
