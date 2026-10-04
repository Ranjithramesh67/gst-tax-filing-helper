'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { useFirmPath } from '@/lib/firm';
import { Badge, Button, Card, EmptyState, PageHeader, Select, Spinner } from '@/components/ui';
import { OtpCard } from '@/components/sms/OtpCard';
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

const REFRESH_OPTIONS = [
  { label: 'Auto-refresh: Off', value: 0 },
  { label: 'Every 5 seconds', value: 5000 },
  { label: 'Every 10 seconds', value: 10000 },
  { label: 'Every 30 seconds', value: 30000 },
  { label: 'Every 60 seconds', value: 60000 },
];

const REFRESH_STORAGE_KEY = 'gstflow:sms:autoRefreshMs';

export default function SmsInboxPage() {
  const [page, setPage] = useState(1);
  const [clientId, setClientId] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [refreshMs, setRefreshMs] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const stored = Number(window.localStorage.getItem(REFRESH_STORAGE_KEY));
    return REFRESH_OPTIONS.some((option) => option.value === stored) ? stored : 0;
  });
  const to = useFirmPath();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(REFRESH_STORAGE_KEY, String(refreshMs));
    }
  }, [refreshMs]);

  const clients = useQuery({
    queryKey: ['clients', 'options'],
    queryFn: () => api.clients.list({ pageSize: 200 }),
  });

  const inbox = useQuery({
    queryKey: ['inbox', { page, pageSize: PAGE_SIZE, clientId, category, status }],
    queryFn: () =>
      api.inbox.list({
        page,
        pageSize: PAGE_SIZE,
        clientId: clientId || undefined,
        category: category || undefined,
        status: status || undefined,
      }),
    placeholderData: (previous) => previous,
    refetchInterval: refreshMs > 0 ? refreshMs : false,
    refetchIntervalInBackground: false,
  });

  function updateFilter(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  const items = inbox.data?.items ?? [];
  const total = inbox.data?.total ?? 0;
  const totalPages = inbox.data?.totalPages ?? 1;

  return (
    <div>
      <PageHeader
        title="SMS Inbox"
        description="Incoming GST-related messages captured from client devices."
      />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Auto-refresh</span>
            <Select
              value={String(refreshMs)}
              onChange={(e) => setRefreshMs(Number(e.target.value))}
            >
              {REFRESH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </Card>

      <Card>
        {inbox.isLoading ? (
          <Spinner label="Loading messages..." />
        ) : inbox.isError ? (
          <div className="px-4 py-10 text-center text-sm text-red-600">
            {inbox.error instanceof Error ? inbox.error.message : 'Failed to load messages'}
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No messages" description="Try adjusting the filters or wait for client devices to sync." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Received</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">From</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Message</th>
                  <th className="px-4 py-3 font-medium">OTP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) =>
                  item.kind === 'OTP' ? (
                    <tr key={item.id} className="transition hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {formatDateTime(item.receivedAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        <Link
                          href={to(`/sms/otp/${item.id}`)}
                          className="font-medium hover:text-brand-700"
                        >
                          {item.client.name || '-'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.from ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-400">-</td>
                      <td className="px-4 py-3 text-slate-400">-</td>
                      <td className="max-w-xs px-4 py-3 text-slate-500">
                        <Link
                          href={to(`/sms/otp/${item.id}`)}
                          className="block truncate hover:text-slate-800"
                        >
                          {item.snippet ?? item.subject ?? '-'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <OtpCard item={item} />
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id} className="transition hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {formatDateTime(item.receivedAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        <Link href={to(`/sms/${item.id}`)} className="font-medium hover:text-brand-700">
                          {item.client?.name ?? '-'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.sender}</td>
                      <td className="px-4 py-3">
                        <Badge tone={CATEGORY_TONES[item.category]}>{categoryLabel(item.category)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONES[item.status]}>{categoryLabel(item.status)}</Badge>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-slate-500">
                        <Link href={to(`/sms/${item.id}`)} className="block truncate hover:text-slate-800">
                          {snippet(item.body)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {extractOtp(item.body)?.code ? (
                          <span className="font-mono font-semibold tracking-wider text-slate-800">
                            {extractOtp(item.body)?.code}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!inbox.isLoading && !inbox.isError && total > 0 ? (
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

      {inbox.isFetching && !inbox.isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <Mail className="h-3 w-3" /> Refreshing...
        </p>
      ) : null}
    </div>
  );
}
