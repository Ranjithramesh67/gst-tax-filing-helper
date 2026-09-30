import { DocumentType } from '@gstflow/types';
import { z } from 'zod';

const documentTypeValues = Object.values(DocumentType) as [DocumentType, ...DocumentType[]];

export const uploadDocumentSchema = z.object({
  clientId: z.string().trim().min(1, 'clientId is required'),
  type: z.enum(documentTypeValues).optional(),
  smsMessageId: z.string().trim().min(1).optional(),
});

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  clientId: z.string().trim().min(1).optional(),
  type: z.enum(documentTypeValues).optional(),
});

export type UploadDocumentDto = z.infer<typeof uploadDocumentSchema>;
export type ListDocumentsQueryDto = z.infer<typeof listDocumentsQuerySchema>;

export interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
