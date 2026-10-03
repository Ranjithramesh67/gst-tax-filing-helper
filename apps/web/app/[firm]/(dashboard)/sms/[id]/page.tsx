'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, FileText, User } from 'lucide-react';
import type { ClassifySmsBody, SmsCategory, SmsStatus } from '@gstflow/types';
import { api } from '@/lib/api';
import { useFirmPath } from '@/lib/firm';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Select, Spinner } from '@/components/ui';
import {
  CATEGORY_TONES,
  SMS_CATEGORIES,
  SMS_STATUSES,
  STATUS_TONES,
  categoryLabel,
  formatDateTime,
  formatMoney,
} from '@/components/sms/classification';

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

export default function SmsDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const queryClient = useQueryClient();
  const to = useFirmPath();

  const sms = useQuery({
    queryKey: ['sms', id],
    queryFn: () => api.sms.get(id),
    enabled: Boolean(id),
  });

  const [category, setCategory] = useState<SmsCategory | ''>('');
  const [status, setStatus] = useState<SmsStatus | ''>('');

  useEffect(() => {
    if (sms.data) {
      setCategory(sms.data.category);
      setStatus(sms.data.status);
    }
  }, [sms.data]);

  const mutation = useMutation({
    mutationFn: (body: ClassifySmsBody) => api.sms.classify(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sms'] });
      void queryClient.invalidateQueries({ queryKey: ['sms', id] });
    },
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!category) return;
    mutation.mutate({ category, status: status || undefined });
  }

  if (sms.isLoading) {
    return <Spinner label="Loading message..." />;
  }

  if (sms.isError) {
    return (
      <div>
        <Link
          href={to('/sms')}
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back to inbox
        </Link>
        <Card className="px-4 py-10 text-center text-sm text-red-600">
          {sms.error instanceof Error ? sms.error.message : 'Failed to load message'}
        </Card>
      </div>
    );
  }

  if (!sms.data) {
    return (
      <Card>
        <EmptyState title="Message not found" description="This SMS message may have been removed." />
      </Card>
    );
  }

  const message = sms.data;
  const parsed = message.parsed;
  const documents = message.documents ?? [];
  const clientId = message.clientId;

  return (
    <div>
      <Link
        href={to('/sms')}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to inbox
      </Link>

      <PageHeader
        title="SMS Message"
        description={`Received ${formatDateTime(message.receivedAt)}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={CATEGORY_TONES[message.category]}>{categoryLabel(message.category)}</Badge>
            <Badge tone={STATUS_TONES[message.status]}>{categoryLabel(message.status)}</Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Message" />
            <div className="space-y-3 px-4 py-4">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                <DetailRow label="Sender" value={message.sender} />
                <DetailRow label="Received" value={formatDateTime(message.receivedAt)} />
                <DetailRow label="Client" value={message.client?.name ?? '-'} />
                <DetailRow label="Client GSTIN" value={message.client?.gstin ?? '-'} />
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-800">
                {message.body}
              </pre>
            </div>
          </Card>

          <Card>
            <CardHeader title="Parsed GST data" />
            {parsed ? (
              <div className="px-4 py-4">
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  <DetailRow label="GSTIN" value={parsed.gstin ?? '-'} />
                  <DetailRow label="Invoice No." value={parsed.invoiceNo ?? '-'} />
                  <DetailRow label="Amount" value={formatMoney(parsed.amount)} />
                  <DetailRow label="Taxable value" value={formatMoney(parsed.taxableValue)} />
                  <DetailRow label="Tax amount" value={formatMoney(parsed.taxAmount)} />
                  <DetailRow label="HSN" value={parsed.hsn ?? '-'} />
                  <DetailRow label="Due date" value={parsed.dueDate ?? '-'} />
                  <DetailRow
                    label="Confidence"
                    value={`${Math.round(parsed.confidence * 100)}%`}
                  />
                </div>
              </div>
            ) : (
              <EmptyState title="No parsed data" description="No GST fields could be extracted from this message." />
            )}
          </Card>

          <Card>
            <CardHeader title={`Attached documents (${documents.length})`} />
            {documents.length === 0 ? (
              <EmptyState title="No documents" description="No files have been attached to this message." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{doc.fileName}</p>
                        <p className="text-xs text-slate-400">
                          {doc.type} &middot; {(doc.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <a
                      href={`/api/documents/${doc.id}/download`}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="h-4 w-4" /> Download
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Classify" />
            <form onSubmit={onSubmit} className="space-y-4 px-4 py-4">
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">Category</span>
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SmsCategory)}
                  required
                >
                  <option value="" disabled>
                    Select category
                  </option>
                  {SMS_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {categoryLabel(value)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">Status</span>
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as SmsStatus)}
                >
                  <option value="">Keep current</option>
                  {SMS_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {categoryLabel(value)}
                    </option>
                  ))}
                </Select>
              </label>
              {mutation.isError ? (
                <p className="text-sm text-red-600">
                  {mutation.error instanceof Error ? mutation.error.message : 'Classification failed'}
                </p>
              ) : null}
              {mutation.isSuccess ? (
                <p className="text-sm text-green-600">Classification saved.</p>
              ) : null}
              <Button type="submit" className="w-full" disabled={mutation.isPending || !category}>
                {mutation.isPending ? 'Saving...' : 'Save classification'}
              </Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Client actions" />
            <div className="space-y-2 px-4 py-4">
              {clientId ? (
                <>
                  <Link
                    href={to(`/filings?clientId=${clientId}`)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
                  >
                    <User className="h-4 w-4" /> Create filing
                  </Link>
                  <Link
                    href={to(`/filings?clientId=${clientId}`)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <FileText className="h-4 w-4" /> Create return
                  </Link>
                </>
              ) : (
                <p className="text-sm text-slate-400">No client linked to this message.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
