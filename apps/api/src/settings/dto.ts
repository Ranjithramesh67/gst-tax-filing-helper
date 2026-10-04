import { z } from 'zod';
import { otpSettingsSchema, smsKeywordSchema, smsRetentionSchema } from '@gstflow/validation';

export type UpdateSmsRetentionInput = z.infer<typeof smsRetentionSchema>;
export type UpdateSmsKeywordInput = z.infer<typeof smsKeywordSchema>;
export type UpdateOtpSettingsInput = z.infer<typeof otpSettingsSchema>;

export { otpSettingsSchema, smsKeywordSchema, smsRetentionSchema };
