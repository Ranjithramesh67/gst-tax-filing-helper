'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import type { ClientStatus } from '@gstflow/types';
import { ClientStatus as ClientStatusEnum } from '@gstflow/types';
import { api } from '@/lib/api';
import { useFirmPath } from '@/lib/firm';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '@/components/ui';
import { ClientForm, toCreateClientBody, type ClientFormValues } from '@/components/clients/client-form';

const PAGE_SIZE = 10;

const STATUS_TONE: Record<ClientStatus, 'success' | 'warning' | 'neutral'> = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
  ARCHIVED: 'neutral',
};

type StatusFilter = 'ALL' | ClientStatus;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const to = useFirmPath();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const query = useQuery({
    queryKey: ['clients', { page, pageSize: PAGE_SIZE, search: debouncedSearch, status }],
    queryFn: () =>
      api.clients.list({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: status === 'ALL' ? undefined : status,
      }),
  });

  const createMutation = useMutation({
    mutationFn: (values: ClientFormValues) => api.clients.create(toCreateClientBody(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setShowCreate(false);
    },
  });

  const clients = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = useMemo(() => {
    if (query.data?.totalPages) return query.data.totalPages;
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }, [query.data?.totalPages, total]);

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Manage the businesses whose GST returns your firm files."
        action={
          <Button onClick={() => setShowCreate((open) => !open)}>
            <Plus className="h-4 w-4" /> Add client
          </Button>
        }
      />

      {showCreate ? (
        <Card className="mb-6">
          <CardHeader title="New client" />
          <div className="p-4">
            <ClientForm
              submitLabel="Create client"
              submitting={createMutation.isPending}
              error={createMutation.isError ? errorMessage(createMutation.error) : null}
              onSubmit={(values) => createMutation.mutate(values)}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search by name, GSTIN or phone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="w-48">
            <Select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
              <option value="ALL">All statuses</option>
              {Object.values(ClientStatusEnum).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {query.isLoading ? (
          <div className="px-4">
            <Spinner />
          </div>
        ) : query.isError ? (
          <div className="p-4 text-sm text-red-600">{errorMessage(query.error)}</div>
        ) : clients.length === 0 ? (
          <EmptyState
            title="No clients found"
            description="Add a client or adjust your search and filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">GSTIN</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Consent</th>
                  <th className="px-4 py-3 font-medium">SMS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={to(`/clients/${client.id}`)}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{client.gstin ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{client.phone}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[client.status]}>{client.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={client.consentGranted ? 'success' : 'neutral'}>
                        {client.consentGranted ? 'Granted' : 'Not granted'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{client._count?.smsMessages ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
          <span>
            {total} client{total === 1 ? '' : 's'} &middot; page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
