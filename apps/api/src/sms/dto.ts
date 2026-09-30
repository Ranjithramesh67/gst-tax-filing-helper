import type { ClassifySmsBody, SmsIngestBody, SmsIngestResponse } from '@gstflow/types';

export type SmsIngestDto = SmsIngestBody;
export type SmsIngestResult = SmsIngestResponse;
export type ClassifySmsDto = ClassifySmsBody;

export interface SmsListQueryDto {
  clientId?: string;
  category?: string;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: string;
  pageSize?: string;
}
