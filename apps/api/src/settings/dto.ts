import { z } from 'zod';
import { smsKeywordSchema, smsRetentionSchema } from '@gstflow/validation';

export type UpdateSmsRetentionInput = z.infer<typeof smsRetentionSchema>;
export type UpdateSmsKeywordInput = z.infer<typeof smsKeywordSchema>;

export { smsKeywordSchema, smsRetentionSchema };
