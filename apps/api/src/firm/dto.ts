import { z } from 'zod';
import { updateFirmSettingsSchema } from '@gstflow/validation';

export type UpdateFirmSettingsInput = z.infer<typeof updateFirmSettingsSchema>;
