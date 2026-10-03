'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { FirmStatus } from '@gstflow/types';
import type { Firm, ListQuery } from '@gstflow/types';
import { api } from '@/lib/api';
import { FirmForm } from '@/components/firms/FirmForm';
import { FirmEditDialog } from '@/components/firms/FirmEditDialog';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '@/components/ui';

const PAGE_SIZE = 10;
const STATUS_FILTERS = ['ALL', FirmStatus.ACTIVE, FirmStatus.SUSPENDED, FirmStatus.PENDING] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_TONES: Record<FirmStatus, 'success' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  SUSPENDED: 'danger',
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function FirmsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Firm | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const listQuery: ListQuery & { status?: FirmStatus } = {
    page,
    pageSize: PAGE_SIZE,
    search: search.trim() || undefined,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
  };

  const firmsQuery = useQuery({
    queryKey: ['admin', 'firms', listQuery],
    queryFn: () => api.admin.firms.list(listQuery),
  });

  const firms = firmsQuery.data?.items ?? [];
  const total = firmsQuery.data?.total ?? 0;
  const totalPages = firmsQuery.data?.totalPages ?? 1;

  return (
    <div>
      <PageHeader title="Firms" description="Onboard and manage firms on the platform." />

      <FirmForm />

      <Card className="mt-6">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name, slug, GSTIN or email"
            className="sm:max-w-xs"
          />
          <div className="sm:w-44">
            <Select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter);
                setPage(1);
              }}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option} value={option}>
                  {option === 'ALL' ? 'All statuses' : option}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {firmsQuery.isLoading ? (
          <Spinner label="Loading firms..." />
        ) : firmsQuery.isError ? (
          <div className="p-6 text-sm text-red-600">
            {firmsQuery.error instanceof Error
              ? firmsQuery.error.message
              : 'Failed to load firms.'}
          </div>
        ) : firms.length === 0 ? (
          <EmptyState
            title="No firms found"
            description="Adjust your filters or add a new firm above."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Branding</th>
                  <th className="px-4 py-3 font-medium">Fee</th>
                  <th className="px-4 py-3 font-medium">GSTIN</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Clients</th>
                  <th className="px-4 py-3 font-medium">Users</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {firms.map((firm) => (
                  <tr
                    key={firm.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{firm.name}</td>
                    <td className="px-4 py-3 text-slate-500">{firm.slug}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {firm.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={firm.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
                        ) : null}
                        <span
                          className="h-4 w-4 rounded-full border border-slate-300"
                          style={{ backgroundColor: firm.brandColor ?? '#ffffff' }}
                        />
                        {firm.brandColor ? (
                          <span className="font-mono text-xs text-slate-500">{firm.brandColor}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {firm.defaultFilingFee === null || firm.defaultFilingFee === undefined
                        ? '-'
                        : `₹${firm.defaultFilingFee}`}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{firm.gstin ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONES[firm.status]}>{firm.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{firm._count?.clients ?? 0}</td>
                    <td className="px-4 py-3 text-slate-500">{firm._count?.users ?? 0}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(firm.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" onClick={() => setEditing(firm)}>
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-slate-200 p-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>{total === 1 ? '1 firm' : `${total} firms`}</span>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              disabled={page <= 1 || firmsQuery.isFetching}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= totalPages || firmsQuery.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {editing ? <FirmEditDialog firm={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
