'use client';

import { Fragment, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, FileText, History, Plus, Wallet, XCircle } from 'lucide-react';
import type { Filing, GstReturn, PaymentState, ReturnType } from '@gstflow/types';
import { api } from '@/lib/api';
import { useFirmBranding } from '@/lib/firm';
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
import { PaymentsPanel } from '@/components/payments/PaymentsPanel';
import { formatDateTime, formatMoney } from '@/components/sms/classification';

const RETURN_TYPES: ReturnType[] = ['GSTR1', 'GSTR3B', 'GSTR9', 'OTHER'];

const STATUSES: Array<{ value: Filing['status']; label: string }> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'FILED', label: 'Filed' },
  { value: 'REJECTED', label: 'Rejected' },
];

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

function statusTone(status: Filing['status']): Tone {
  switch (status) {
    case 'FILED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'IN_REVIEW':
      return 'info';
    default:
      return 'warning';
  }
}

function paymentTone(state?: PaymentState): Tone {
  switch (state) {
    case 'PAID':
      return 'success';
    case 'PARTIAL':
      return 'warning';
    case 'UNPAID':
      return 'danger';
    default:
      return 'neutral';
  }
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

function toIsoDate(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  const lastPage = Math.max(totalPages, 1);
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
      <span>
        Page {page} of {lastPage}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <Button variant="secondary" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function StatusHistoryPanel({ filingId }: { filingId: string }) {
  const query = useQuery({
    queryKey: ['filing-history', filingId],
    queryFn: () => api.filings.history(filingId),
  });

  if (query.isLoading) return <Spinner />;
  if (query.isError) {
    return <p className="px-4 py-4 text-sm text-red-600">{errorMessage(query.error)}</p>;
  }

  const events = query.data ?? [];
  if (events.length === 0) {
    return <EmptyState title="No history" description="No status changes recorded yet." />;
  }

  return (
    <ol className="space-y-3 px-4 py-4">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />
          <div className="pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(event.status)}>{event.status}</Badge>
              {event.previousStatus ? (
                <span className="text-xs text-slate-400">from {event.previousStatus}</span>
              ) : null}
              <Badge tone={event.source === 'SMS' ? 'info' : 'neutral'}>{event.source}</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {formatDateTime(event.createdAt)}
              {event.actorName ? ` · ${event.actorName}` : ''}
            </p>
            {event.note ? <p className="mt-0.5 text-xs text-slate-500">{event.note}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function FilingsView() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialClientId = searchParams.get('clientId') ?? '';

  const [tab, setTab] = useState<'returns' | 'filings'>('returns');

  const clientsQuery = useQuery({
    queryKey: ['clients', 'filings-select'],
    queryFn: () => api.clients.list({ pageSize: 200 }),
  });
  const clients = clientsQuery.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Filings"
        description="Create GST returns and file them for your clients."
      />

      <div className="mb-6 inline-flex rounded-md border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab('returns')}
          className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium ${
            tab === 'returns' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="h-4 w-4" /> Returns
        </button>
        <button
          type="button"
          onClick={() => setTab('filings')}
          className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium ${
            tab === 'filings' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" /> Filings
        </button>
      </div>

      {tab === 'returns' ? (
        <ReturnsSection
          clients={clients}
          clientsLoading={clientsQuery.isLoading}
          clientsError={clientsQuery.isError}
          initialClientId={initialClientId}
          queryClient={queryClient}
        />
      ) : (
        <FilingsSection
          clients={clients}
          clientsLoading={clientsQuery.isLoading}
          clientsError={clientsQuery.isError}
          initialClientId={initialClientId}
          queryClient={queryClient}
        />
      )}
    </div>
  );
}

function ReturnsSection({
  clients,
  clientsLoading,
  clientsError,
  initialClientId,
  queryClient,
}: {
  clients: Array<{ id: string; name: string }>;
  clientsLoading: boolean;
  clientsError: boolean;
  initialClientId: string;
  queryClient: QueryClient;
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const [type, setType] = useState<ReturnType>('GSTR1');
  const [period, setPeriod] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [filterClientId, setFilterClientId] = useState(initialClientId);
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const returnsQuery = useQuery({
    queryKey: ['returns', { page, pageSize, clientId: filterClientId, status: filterStatus }],
    queryFn: () =>
      api.returns.list({
        page,
        pageSize,
        clientId: filterClientId || undefined,
        status: filterStatus || undefined,
      }),
  });

  const createReturn = useMutation({
    mutationFn: () =>
      api.returns.create({
        clientId,
        type,
        period,
        dueDate: toIsoDate(dueDate),
      }),
    onSuccess: () => {
      setPeriod('');
      setDueDate('');
      void queryClient.invalidateQueries({ queryKey: ['returns'] });
    },
  });

  const canSubmit = clientId !== '' && period !== '' && !createReturn.isPending;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    createReturn.mutate();
  }

  const items = returnsQuery.data?.items ?? [];
  const totalPages = returnsQuery.data?.totalPages ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Create return" />
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-5">
          <Field label="Client">
            <Select
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              disabled={clientsLoading}
              required
            >
              <option value="">Select client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Return type">
            <Select value={type} onChange={(event) => setType(event.target.value as ReturnType)}>
              {RETURN_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Period">
            <Input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              required
            />
          </Field>
          <Field label="Due date" hint="Optional">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={!canSubmit}>
              <Plus className="h-4 w-4" />
              {createReturn.isPending ? 'Creating...' : 'Create return'}
            </Button>
          </div>
        </form>
        {clientsError ? (
          <p className="px-4 pb-4 text-sm text-red-600">Failed to load clients.</p>
        ) : null}
        {createReturn.isError ? (
          <p className="px-4 pb-4 text-sm text-red-600">{errorMessage(createReturn.error)}</p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Returns"
          action={
            <div className="flex flex-wrap gap-2">
              <Select
                className="w-44"
                value={filterClientId}
                onChange={(event) => {
                  setFilterClientId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
              <Select
                className="w-40"
                value={filterStatus}
                onChange={(event) => {
                  setFilterStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        {returnsQuery.isLoading ? (
          <Spinner />
        ) : returnsQuery.isError ? (
          <p className="px-4 py-6 text-sm text-red-600">{errorMessage(returnsQuery.error)}</p>
        ) : items.length === 0 ? (
          <EmptyState title="No returns found" description="Create a return or adjust the filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Filed</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: GstReturn) => {
                  const client = clients.find((entry) => entry.id === item.clientId);
                  return (
                    <tr key={item.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 text-slate-700">{client?.name ?? item.clientId}</td>
                      <td className="px-4 py-3 text-slate-700">{item.type}</td>
                      <td className="px-4 py-3 text-slate-700">{item.period}</td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(item.dueDate)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(item.filedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!returnsQuery.isLoading && !returnsQuery.isError && items.length > 0 ? (
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        ) : null}
      </Card>
    </div>
  );
}

function FilingsSection({
  clients,
  clientsLoading,
  clientsError,
  initialClientId,
  queryClient,
}: {
  clients: Array<{ id: string; name: string }>;
  clientsLoading: boolean;
  clientsError: boolean;
  initialClientId: string;
  queryClient: QueryClient;
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const [type, setType] = useState<ReturnType>('GSTR1');
  const [period, setPeriod] = useState('');
  const [returnId, setReturnId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const branding = useFirmBranding();
  const [fee, setFee] = useState(
    branding?.defaultFilingFee === null || branding?.defaultFilingFee === undefined
      ? ''
      : String(branding.defaultFilingFee),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  const [filterClientId, setFilterClientId] = useState(initialClientId);
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const clientReturnsQuery = useQuery({
    queryKey: ['returns', 'by-client', clientId],
    queryFn: () => api.returns.list({ clientId, pageSize: 200 }),
    enabled: clientId !== '',
  });
  const clientReturns = clientReturnsQuery.data?.items ?? [];

  const filingsQuery = useQuery({
    queryKey: ['filings', { page, pageSize, clientId: filterClientId, status: filterStatus }],
    queryFn: () =>
      api.filings.list({
        page,
        pageSize,
        clientId: filterClientId || undefined,
        status: filterStatus || undefined,
      }),
  });

  const createFiling = useMutation({
    mutationFn: () =>
      api.filings.create({
        clientId,
        type,
        period,
        returnId: returnId || undefined,
        referenceNo: referenceNo || undefined,
        feeAmount: fee === '' ? undefined : Number(fee),
      }),
    onSuccess: () => {
      setPeriod('');
      setReturnId('');
      setReferenceNo('');
      void queryClient.invalidateQueries({ queryKey: ['filings'] });
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status, referenceNo: ref }: { id: string; status: Filing['status']; referenceNo?: string }) =>
      api.filings.updateStatus(id, { status, referenceNo: ref }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['filings'] });
    },
  });

  const canSubmit = clientId !== '' && period !== '' && !createFiling.isPending;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    createFiling.mutate();
  }

  const items = filingsQuery.data?.items ?? [];
  const totalPages = filingsQuery.data?.totalPages ?? 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Create filing" />
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-3 lg:grid-cols-6">
          <Field label="Client">
            <Select
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                setReturnId('');
              }}
              disabled={clientsLoading}
              required
            >
              <option value="">Select client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Return type">
            <Select value={type} onChange={(event) => setType(event.target.value as ReturnType)}>
              {RETURN_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Period">
            <Input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              required
            />
          </Field>
          <Field label="Linked return" hint="Optional">
            <Select
              value={returnId}
              onChange={(event) => setReturnId(event.target.value)}
              disabled={clientId === '' || clientReturnsQuery.isLoading}
            >
              <option value="">None</option>
              {clientReturns.map((item: GstReturn) => (
                <option key={item.id} value={item.id}>
                  {item.type} · {item.period}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference no." hint="Optional">
            <Input
              value={referenceNo}
              onChange={(event) => setReferenceNo(event.target.value)}
              placeholder="ARN / acknowledgement"
            />
          </Field>
          <Field label="Fee (INR)" hint="Optional">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
              placeholder="0"
            />
          </Field>
          <div className="md:col-span-3 lg:col-span-6">
            <Button type="submit" disabled={!canSubmit}>
              <Plus className="h-4 w-4" />
              {createFiling.isPending ? 'Creating...' : 'Create filing'}
            </Button>
          </div>
        </form>
        {clientsError ? (
          <p className="px-4 pb-4 text-sm text-red-600">Failed to load clients.</p>
        ) : null}
        {createFiling.isError ? (
          <p className="px-4 pb-4 text-sm text-red-600">{errorMessage(createFiling.error)}</p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Filings"
          action={
            <div className="flex flex-wrap gap-2">
              <Select
                className="w-44"
                value={filterClientId}
                onChange={(event) => {
                  setFilterClientId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
              <Select
                className="w-40"
                value={filterStatus}
                onChange={(event) => {
                  setFilterStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        {updateStatus.isError ? (
          <p className="px-4 pt-4 text-sm text-red-600">{errorMessage(updateStatus.error)}</p>
        ) : null}
        {filingsQuery.isLoading ? (
          <Spinner />
        ) : filingsQuery.isError ? (
          <p className="px-4 py-6 text-sm text-red-600">{errorMessage(filingsQuery.error)}</p>
        ) : items.length === 0 ? (
          <EmptyState title="No filings found" description="Create a filing or adjust the filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Filed</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Billing</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: Filing) => {
                  const client = clients.find((entry) => entry.id === item.clientId);
                  const busy = updateStatus.isPending && updateStatus.variables?.id === item.id;
                  return (
                    <Fragment key={item.id}>
                      <tr className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 text-slate-700">{client?.name ?? item.clientId}</td>
                        <td className="px-4 py-3 text-slate-700">{item.type}</td>
                        <td className="px-4 py-3 text-slate-700">{item.period}</td>
                        <td className="px-4 py-3">
                          <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(item.filedAt)}</td>
                        <td className="px-4 py-3 text-slate-500">{item.referenceNo ?? '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <Badge tone={paymentTone(item.paymentState)}>{item.paymentState ?? 'NONE'}</Badge>
                            {item.balanceAmount !== undefined && item.balanceAmount > 0 ? (
                              <span className="text-xs text-slate-500">
                                Due {formatMoney(item.balanceAmount)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              onClick={() =>
                                setExpandedId((current) => (current === item.id ? null : item.id))
                              }
                            >
                              <Wallet className="h-4 w-4" />
                              Payments
                              <ChevronDown
                                className={`h-4 w-4 transition ${
                                  expandedId === item.id ? 'rotate-180' : ''
                                }`}
                              />
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() =>
                                setHistoryId((current) => (current === item.id ? null : item.id))
                              }
                            >
                              <History className="h-4 w-4" />
                              History
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={busy || item.status === 'FILED'}
                              onClick={() =>
                                updateStatus.mutate({
                                  id: item.id,
                                  status: 'FILED',
                                  referenceNo: item.referenceNo ?? undefined,
                                })
                              }
                            >
                              <CheckCircle2 className="h-4 w-4" /> Mark FILED
                            </Button>
                            <Button
                              variant="danger"
                              disabled={busy || item.status === 'REJECTED'}
                              onClick={() => updateStatus.mutate({ id: item.id, status: 'REJECTED' })}
                            >
                              <XCircle className="h-4 w-4" /> Reject
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === item.id ? (
                        <tr className="border-b border-slate-100">
                          <td colSpan={8} className="p-0">
                            <PaymentsPanel filingId={item.id} feeAmount={item.feeAmount} />
                          </td>
                        </tr>
                      ) : null}
                      {historyId === item.id ? (
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <td colSpan={8} className="p-0">
                            <StatusHistoryPanel filingId={item.id} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!filingsQuery.isLoading && !filingsQuery.isError && items.length > 0 ? (
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        ) : null}
      </Card>
    </div>
  );
}

export default function FilingsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <FilingsView />
    </Suspense>
  );
}
