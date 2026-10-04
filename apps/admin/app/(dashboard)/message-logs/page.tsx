'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import type { ListQuery, SmsCategory, SmsStatus } from '@gstflow/types';
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

const PAGE_SIZE = 25;

const CATEGORIES: SmsCategory[] = [
  'GST_INVOICE',
  'GST_RETURN',
  'EWAY_BILL',
  'TAX_PAYMENT',
  'GST_NOTICE',
  'UNCLASSIFIED',
  'OTHER',
];

const STATUSES: SmsStatus[] = ['RECEIVED', 'REVIEWED', 'FILED', 'IGNORED', 'FAILED'];

type SmsListQuery = ListQuery & {
  firmId?: string;
  clientId?: string;
  search?: string;
  category?: string;
  status?: string;
  from?: string;
  to?: string;
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function AdminSmsPage() {
  const [firmId, setFirmId] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const firmsQuery = useQuery({
    queryKey: ['admin', 'firms', 'list', 'sms-filter'],
    queryFn: () => api.admin.firms.list({ pageSize: 200 }),
  });

  const params: SmsListQuery = {
    page,
    pageSize: PAGE_SIZE,
    firmId,
    search,
    category,
    status,
    from,
    to,
  };

  const smsQuery = useQuery({
    queryKey: ['admin', 'sms', 'list', page, firmId, search, category, status, from, to],
    queryFn: () => api.admin.sms.list(params),
    placeholderData: keepPreviousData,
  });

  const firms = firmsQuery.data?.items ?? [];
  const rows = smsQuery.data?.items ?? [];
  const total = smsQuery.data?.total ?? 0;
  const totalPages = Math.max(smsQuery.data?.totalPages ?? 1, 1);
  const hasFilters = Boolean(firmId || search || category || status || from || to);
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  function applyFilter(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  function resetFilters() {
    setFirmId('');
    setSearch('');
    setCategory('');
    setStatus('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="SMS Messages"
        description="Every SMS forwarded from client devices, across all firms."
        action={
          <Button
            variant="secondary"
            onClick={() => void smsQuery.refetch()}
            disabled={smsQuery.isFetching}
          >
            <RefreshCw className={smsQuery.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Field label="Firm">
            <Select value={firmId} onChange={(event) => applyFilter(setFirmId)(event.target.value)}>
              <option value="">All firms</option>
              {firms.map((firm) => (
                <option key={firm.id} value={firm.id}>
                  {firm.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Search">
            <Input
              value={search}
              onChange={(event) => applyFilter(setSearch)(event.target.value)}
              placeholder="Sender or client"
            />
          </Field>
          <Field label="Category">
            <Select
              value={category}
              onChange={(event) => applyFilter(setCategory)(event.target.value)}
            >
              <option value="">All categories</option>
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(event) => applyFilter(setStatus)(event.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Input
              type="date"
              value={from}
              onChange={(event) => applyFilter(setFrom)(event.target.value)}
            />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(event) => applyFilter(setTo)(event.target.value)} />
          </Field>
        </div>
        {hasFilters ? (
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" onClick={resetFilters}>
              Clear filters
            </Button>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Forwarded messages"
          action={<span className="text-xs text-slate-400">{total} total</span>}
        />

        {smsQuery.isLoading ? (
          <Spinner label="Loading messages..." />
        ) : smsQuery.isError ? (
          <EmptyState
            title="Could not load messages"
            description={smsQuery.error instanceof Error ? smsQuery.error.message : 'Something went wrong.'}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No messages found"
            description={hasFilters ? 'Try adjusting or clearing the filters.' : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-600 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-medium">Received</th>
                    <th className="px-4 py-3 font-medium">Firm</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Sender</th>
                    <th className="px-4 py-3 font-medium">Message</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700">
                  {rows.map((row) => (
                    <tr key={row.id} className="align-top hover:bg-ink-700/40">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                        {formatDateTime(row.receivedAt)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {row.firmName ? (
                          <div>
                            <div className="font-medium text-slate-100">{row.firmName}</div>
                            <div className="text-xs text-slate-500">{row.firmSlug}</div>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div className="font-medium text-slate-100">{row.clientName ?? '-'}</div>
                        {row.clientGstin ? (
                          <div className="font-mono text-xs text-slate-500">{row.clientGstin}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <span className="font-mono text-xs">{row.sender}</span>
                      </td>
                      <td className="max-w-md px-4 py-3 text-slate-300">
                        <details>
                          <summary className="cursor-pointer text-brand-300 hover:text-brand-200">
                            <span className="line-clamp-2 inline">{row.body}</span>
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-ink-900 p-2 text-xs text-slate-300">
                            {row.body}
                          </pre>
                        </details>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="info">{row.category}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            row.status === 'FAILED'
                              ? 'danger'
                              : row.status === 'FILED'
                                ? 'success'
                                : 'neutral'
                          }
                        >
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-600 px-4 py-3">
              <span className="text-xs text-slate-500">
                Showing {rangeStart}-{rangeEnd} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                  disabled={page <= 1 || smsQuery.isFetching}
                >
                  Previous
                </Button>
                <span className="text-xs text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
                  disabled={page >= totalPages || smsQuery.isFetching}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
