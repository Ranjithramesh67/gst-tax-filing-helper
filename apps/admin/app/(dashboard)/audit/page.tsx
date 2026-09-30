'use client';

import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import type { AuditLog, ListQuery } from '@gstflow/types';
import {
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

type AuditListQuery = ListQuery & {
  firmId?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function MetaCell({ meta }: { meta: AuditLog['meta'] }) {
  const json = useMemo(() => (meta ? JSON.stringify(meta, null, 2) : null), [meta]);
  if (!json) return <span className="text-slate-400">-</span>;
  return (
    <details>
      <summary className="cursor-pointer text-xs font-medium text-brand-600 hover:text-brand-700">
        View meta
      </summary>
      <pre className="mt-2 max-w-xs overflow-x-auto rounded-md bg-slate-50 p-2 text-xs text-slate-600">
        {json}
      </pre>
    </details>
  );
}

export default function AuditLogPage() {
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [firmId, setFirmId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const firmsQuery = useQuery({
    queryKey: ['admin', 'firms', 'list', 'audit-filter'],
    queryFn: () => api.admin.firms.list({ pageSize: 200 }),
  });

  const params: AuditListQuery = { page, pageSize: PAGE_SIZE, action, entity, firmId, from, to };

  const auditQuery = useQuery({
    queryKey: ['admin', 'audit', 'list', page, action, entity, firmId, from, to],
    queryFn: () => api.admin.audit.list(params),
    placeholderData: keepPreviousData,
  });

  const firms = firmsQuery.data?.items ?? [];
  const rows = auditQuery.data?.items ?? [];
  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.max(auditQuery.data?.totalPages ?? 1, 1);
  const hasFilters = Boolean(action || entity || firmId || from || to);
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  function applyFilter(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setPage(1);
    };
  }

  function resetFilters() {
    setAction('');
    setEntity('');
    setFirmId('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Every ingest, review, upload and filing action is recorded for compliance."
        action={
          <Button variant="secondary" onClick={() => void auditQuery.refetch()} disabled={auditQuery.isFetching}>
            <RefreshCw className={auditQuery.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Field label="Action">
            <Input
              value={action}
              onChange={(event) => applyFilter(setAction)(event.target.value)}
              placeholder="e.g. sms.ingest"
            />
          </Field>
          <Field label="Entity">
            <Input
              value={entity}
              onChange={(event) => applyFilter(setEntity)(event.target.value)}
              placeholder="e.g. Client"
            />
          </Field>
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
          <Field label="From">
            <Input type="date" value={from} onChange={(event) => applyFilter(setFrom)(event.target.value)} />
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
          title="Recorded events"
          action={<span className="text-xs text-slate-400">{total} total</span>}
        />

        {auditQuery.isLoading ? (
          <Spinner label="Loading audit events..." />
        ) : auditQuery.isError ? (
          <EmptyState
            title="Could not load audit events"
            description={auditQuery.error instanceof Error ? auditQuery.error.message : 'Something went wrong.'}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No audit events found"
            description={hasFilters ? 'Try adjusting or clearing the filters.' : undefined}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Entity</th>
                    <th className="px-4 py-3 font-medium">Entity ID</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                    <th className="px-4 py-3 font-medium">IP</th>
                    <th className="px-4 py-3 font-medium">Meta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="align-top hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-800">{row.action}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.entity}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {row.entityId ? (
                          <span className="break-all">{row.entityId}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {row.actorId ? (
                          <span className="break-all">{row.actorId}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {row.ip ?? <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        <MetaCell meta={row.meta} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
              <span className="text-xs text-slate-500">
                Showing {rangeStart}-{rangeEnd} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                  disabled={page <= 1 || auditQuery.isFetching}
                >
                  Previous
                </Button>
                <span className="text-xs text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
                  disabled={page >= totalPages || auditQuery.isFetching}
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
