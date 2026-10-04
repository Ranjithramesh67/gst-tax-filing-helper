import type { OtpIngestBody, OtpIngestResponse } from '@gstflow/types';

export type OtpIngestDto = OtpIngestBody;
export type OtpIngestResult = OtpIngestResponse;

/** Query string shape for `GET /inbox`; all values arrive as strings. */
export interface InboxListQueryDto {
  clientId?: string;
  category?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
}
