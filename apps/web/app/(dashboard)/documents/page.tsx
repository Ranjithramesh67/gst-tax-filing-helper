'use client';

import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Upload } from 'lucide-react';
import { DocumentType } from '@gstflow/types';
import type { Client, Document } from '@gstflow/types';
import { api } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '@/components/ui';

const PAGE_SIZE = 20;

const DOCUMENT_TYPES: DocumentType[] = [
  DocumentType.BILL,
  DocumentType.TAX_FILED_COPY,
  DocumentType.INVOICE_COPY,
  DocumentType.GST_CERTIFICATE,
  DocumentType.OTHER,
];

const TYPE_LABELS: Record<DocumentType, string> = {
  BILL: 'Bill',
  TAX_FILED_COPY: 'Tax filed copy',
  INVOICE_COPY: 'Invoice copy',
  GST_CERTIFICATE: 'GST certificate',
  OTHER: 'Other',
};

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TYPE_TONES: Record<DocumentType, BadgeTone> = {
  BILL: 'info',
  TAX_FILED_COPY: 'success',
  INVOICE_COPY: 'neutral',
  GST_CERTIFICATE: 'warning',
  OTHER: 'neutral',
};

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

export default function DocumentsPage() {
  const queryClient = useQueryClient();

  const [uploadClientId, setUploadClientId] = useState('');
  const [uploadType, setUploadType] = useState<DocumentType>(DocumentType.BILL);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [smsMessageId] = useState('');

  const [filterClientId, setFilterClientId] = useState('');
  const [filterType, setFilterType] = useState('');
  const [page, setPage] = useState(1);

  const clients = useQuery({
    queryKey: ['clients', 'options'],
    queryFn: () => api.clients.list({ pageSize: 200 }),
  });

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    for (const client of clients.data?.items ?? []) map.set(client.id, client);
    return map;
  }, [clients.data]);

  const documents = useQuery({
    queryKey: ['documents', { page, clientId: filterClientId, type: filterType }],
    queryFn: () =>
      api.documents.list({
        page,
        pageSize: PAGE_SIZE,
        clientId: filterClientId || undefined,
        type: filterType || undefined,
      }),
  });

  const upload = useMutation({
    mutationFn: (formData: FormData) => api.documents.upload(formData),
    onSuccess: () => {
      setFile(null);
      setFileKey((current) => current + 1);
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const canUpload = Boolean(uploadClientId && uploadType && file) && !upload.isPending;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  function handleUpload() {
    if (!file || !uploadClientId) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('clientId', uploadClientId);
    formData.append('type', uploadType);
    if (smsMessageId) formData.append('smsMessageId', smsMessageId);
    upload.mutate(formData);
  }

  function handleClientFilter(value: string) {
    setFilterClientId(value);
    setPage(1);
  }

  function handleTypeFilter(value: string) {
    setFilterType(value);
    setPage(1);
  }

  const items: Document[] = documents.data?.items ?? [];
  const totalPages = documents.data?.totalPages ?? 1;
  const total = documents.data?.total ?? 0;

  return (
    <div>
      <PageHeader title="Documents" description="Upload bills, tax-filed copies and GST documents for your clients." />

      <Card className="mb-6">
        <CardHeader title="Upload document" />
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Client">
            <Select
              value={uploadClientId}
              onChange={(event) => setUploadClientId(event.target.value)}
              disabled={clients.isLoading}
            >
              <option value="">Select a client...</option>
              {(clients.data?.items ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Document type">
            <Select value={uploadType} onChange={(event) => setUploadType(event.target.value as DocumentType)}>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="File" hint="PDF or image.">
            <Input
              key={fileKey}
              type="file"
              accept="application/pdf,image/*"
              onChange={handleFileChange}
            />
          </Field>

          <input type="hidden" name="smsMessageId" value={smsMessageId} readOnly />

          <div className="flex items-end">
            <Button type="button" onClick={handleUpload} disabled={!canUpload}>
              <Upload className="h-4 w-4" />
              {upload.isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>

        {clients.isError ? (
          <p className="px-4 pb-3 text-sm text-red-600">Could not load clients.</p>
        ) : null}

        {upload.isSuccess ? (
          <p className="px-4 pb-3 text-sm text-green-600">Document uploaded successfully.</p>
        ) : null}
        {upload.isError ? (
          <p className="px-4 pb-3 text-sm text-red-600">
            {upload.error instanceof Error ? upload.error.message : 'Upload failed.'}
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title={`All documents${total ? ` (${total})` : ''}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select
                className="w-44"
                value={filterClientId}
                onChange={(event) => handleClientFilter(event.target.value)}
                disabled={clients.isLoading}
              >
                <option value="">All clients</option>
                {(clients.data?.items ?? []).map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
              <Select
                className="w-44"
                value={filterType}
                onChange={(event) => handleTypeFilter(event.target.value)}
              >
                <option value="">All types</option>
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {documents.isLoading ? (
          <Spinner />
        ) : documents.isError ? (
          <div className="px-4 py-8 text-sm text-red-600">Could not load documents.</div>
        ) : items.length === 0 ? (
          <EmptyState title="No documents found" description="Upload a document or adjust the filters above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">File name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Uploaded</th>
                  <th className="px-4 py-3 font-medium text-right">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((document) => (
                  <tr key={document.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-slate-800">
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="max-w-xs truncate" title={document.fileName}>
                          {document.fileName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={TYPE_TONES[document.type]}>{TYPE_LABELS[document.type]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {clientMap.get(document.clientId)?.name ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatSize(document.size)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(document.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/api/documents/${document.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!documents.isLoading && !documents.isError && items.length > 0 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <span>
              Page {page} of {Math.max(1, totalPages)}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
