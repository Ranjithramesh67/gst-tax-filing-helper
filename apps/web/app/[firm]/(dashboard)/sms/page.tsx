'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { useFirmPath } from '@/lib/firm';
import { Badge, Button, Card, EmptyState, PageHeader, Select, Spinner } from '@/components/ui';
import {
  CATEGORY_TONES,
  SMS_CATEGORIES,
  SMS_STATUSES,
  STATUS_TONES,
  categoryLabel,
  extractOtp,
  formatDateTime,
  snippet,
} from '@/components/sms/classification';

const PAGE_SIZE = 20;

export default function SmsInboxPage() {
  const [page, setPage] = useState(1);
  const [clientId, setClientId] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const to = useFirmPath();

  const clients = useQuery({
    queryKey: ['clients', 'options'],
    queryFn: () => api.clients.list({ pageSize: 200 }),
  });

  const sms = useQuery({
    queryKey: ['sms', { page, pageSize: PAGE_SIZE, clientId, category, status }],
    queryFn: () =>
      api.sms.list({
        page,
        pageSize: PAGE_SIZE,
        clientId: clientId || undefined,
        category: category || undefined,
        status: status || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  function updateFilter(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  const items = sms.data?.items ?? [];
  const total = sms.data?.total ?? 0;
  const totalPages = sms.data?.totalPages ?? 1;

  return (
    <div>
      <PageHeader
        title="SMS Inbox"
        description="Incoming GST-related messages captured from client devices."
      />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Client</span>
            <Select value={clientId} onChange={(e) => updateFilter(setClientId)(e.target.value)}>
              <option value="">All clients</option>
              {(clients.data?.items ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Category</span>
            <Select value={category} onChange={(e) => updateFilter(setCategory)(e.target.value)}>
              <option value="">All categories</option>
              {SMS_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {categoryLabel(value)}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Status</span>
            <Select value={status} onChange={(e) => updateFilter(setStatus)(e.target.value)}>
              <option value="">All statuses</option>
              {SMS_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {categoryLabel(value)}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </Card>

      <Card>
        {sms.isLoading ? (
          <Spinner label="Loading messages..." />
        ) : sms.isError ? (
          <div className="px-4 py-10 text-center text-sm text-red-600">
            {sms.error instanceof Error ? sms.error.message : 'Failed to load messages'}
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No SMS messages" description="Try adjusting the filters or wait for client devices to sync." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Received</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Sender</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Message</th>
                  <th className="px-4 py-3 font-medium">OTP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((message) => (
                  <tr key={message.id} className="transition hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {formatDateTime(message.receivedAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      <Link href={to(`/sms/${message.id}`)} className="font-medium hover:text-brand-700">
                        {message.client?.name ?? '-'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{message.sender}</td>
                    <td className="px-4 py-3">
                      <Badge tone={CATEGORY_TONES[message.category]}>{categoryLabel(message.category)}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONES[message.status]}>{categoryLabel(message.status)}</Badge>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-slate-500">
                      <Link href={to(`/sms/${message.id}`)} className="block truncate hover:text-slate-800">
                        {snippet(message.body)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {extractOtp(message.body) ? (
                        <span className="font-mono font-semibold tracking-wider text-slate-800">
                          {extractOtp(message.body)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!sms.isLoading && !sms.isError && total > 0 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            {total} message{total === 1 ? '' : 's'} &middot; page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {sms.isFetching && !sms.isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <Mail className="h-3 w-3" /> Refreshing...
        </p>
      ) : null}
    </div>
  );
}
