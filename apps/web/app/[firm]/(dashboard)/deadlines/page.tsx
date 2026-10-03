'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CheckCircle2 } from 'lucide-react';
import type { Filing, GstReturn } from '@gstflow/types';
import { api } from '@/lib/api';
import { useFirmPath } from '@/lib/firm';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Spinner } from '@/components/ui';

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function DeadlineBadge({ dueDate, done }: { dueDate?: string | null; done: boolean }) {
  if (done) return <Badge tone="success">Filed</Badge>;
  const days = daysUntil(dueDate);
  if (days === null) return <Badge tone="neutral">No due date</Badge>;
  if (days < 0) return <Badge tone="danger">Overdue {Math.abs(days)}d</Badge>;
  if (days <= 7) return <Badge tone="warning">Due in {days}d</Badge>;
  return <Badge tone="info">In {days}d</Badge>;
}

export default function DeadlinesPage() {
  const to = useFirmPath();

  const clientsQuery = useQuery({
    queryKey: ['clients', 'deadlines'],
    queryFn: () => api.clients.list({ pageSize: 200 }),
  });
  const returnsQuery = useQuery({
    queryKey: ['returns', 'deadlines'],
    queryFn: () => api.returns.list({ pageSize: 200 }),
  });
  const filingsQuery = useQuery({
    queryKey: ['filings', 'deadlines'],
    queryFn: () => api.filings.list({ pageSize: 200 }),
  });

  const clients = clientsQuery.data?.items ?? [];
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? id;

  const loading = returnsQuery.isLoading || filingsQuery.isLoading;
  const returns = (returnsQuery.data?.items ?? []).filter((r) => r.status !== 'FILED');
  const filings = (filingsQuery.data?.items ?? []).filter((f) => f.status !== 'FILED' && f.status !== 'REJECTED');

  const overdueReturns = returns.filter((r) => (daysUntil(r.dueDate) ?? 1) < 0);
  const dueSoonReturns = returns.filter((r) => {
    const d = daysUntil(r.dueDate);
    return d !== null && d >= 0 && d <= 7;
  });

  return (
    <div>
      <PageHeader
        title="Deadlines"
        description="Upcoming and overdue GST return due dates across your clients."
      />

      {loading ? (
        <Spinner label="Loading deadlines..." />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Overdue
              </div>
              <div className="mt-1 text-2xl font-semibold text-red-600">{overdueReturns.length}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <CalendarClock className="h-4 w-4 text-amber-500" /> Due in 7 days
              </div>
              <div className="mt-1 text-2xl font-semibold text-amber-600">{dueSoonReturns.length}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Open returns
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{returns.length}</div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Return deadlines" />
            {returns.length === 0 ? (
              <EmptyState title="Nothing pending" description="All returns are filed." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                      <th className="px-4 py-3 font-medium">Client</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Period</th>
                      <th className="px-4 py-3 font-medium">Due date</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...returns]
                      .sort((a, b) => new Date(a.dueDate ?? 0).getTime() - new Date(b.dueDate ?? 0).getTime())
                      .map((item: GstReturn) => (
                        <tr key={item.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-3 text-slate-700">{clientName(item.clientId)}</td>
                          <td className="px-4 py-3 text-slate-700">{item.type}</td>
                          <td className="px-4 py-3 text-slate-700">{item.period}</td>
                          <td className="px-4 py-3 text-slate-500">{formatDate(item.dueDate)}</td>
                          <td className="px-4 py-3">
                            <DeadlineBadge dueDate={item.dueDate} done={item.status === 'FILED'} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={to(`/filings?clientId=${item.clientId}`)}
                              className="text-sm text-brand-700 hover:underline"
                            >
                              Create filing
                            </Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Open filings" />
            {filings.length === 0 ? (
              <EmptyState title="No open filings" description="Filings appear here until they are filed." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                      <th className="px-4 py-3 font-medium">Client</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Period</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filings.map((item: Filing) => (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 text-slate-700">{clientName(item.clientId)}</td>
                        <td className="px-4 py-3 text-slate-700">{item.type}</td>
                        <td className="px-4 py-3 text-slate-700">{item.period}</td>
                        <td className="px-4 py-3">
                          <Badge tone="warning">{item.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {item.balanceAmount !== undefined && item.balanceAmount > 0
                            ? `₹${item.balanceAmount}`
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
