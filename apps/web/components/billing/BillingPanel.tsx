'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CheckCircle2,
  Copy,
  ExternalLink,
  Plus,
  Receipt,
  Send,
  Trash2,
} from 'lucide-react';
import type {
  BillingInvoice,
  BillingInvoiceStatus,
  BillingInvoiceType,
  BillingCycle,
  PaymentRequest,
} from '@gstflow/types';
import { api } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
} from '@/components/ui';
import { formatDateTime, formatMoney } from '@/components/sms/classification';

const STATUS_TONE: Record<
  BillingInvoiceStatus,
  'neutral' | 'success' | 'warning' | 'danger' | 'info'
> = {
  DRAFT: 'neutral',
  ISSUED: 'info',
  PARTIAL: 'warning',
  PAID: 'success',
  VOID: 'danger',
};

const TYPE_LABEL: Record<BillingInvoiceType, string> = {
  PER_FILING: 'Per filing',
  CUMULATIVE: 'Cumulative / ad-hoc',
  SUBSCRIPTION: 'Subscription',
};

const CYCLES: BillingCycle[] = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'];

interface ItemDraft {
  description: string;
  amount: string;
  filingId: string;
}

function emptyItem(): ItemDraft {
  return { description: '', amount: '', filingId: '' };
}

export function BillingPanel() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'invoices' | 'subscriptions'>('invoices');

  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState('');
  const [type, setType] = useState<BillingInvoiceType>('PER_FILING');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([emptyItem()]);

  const [requestFor, setRequestFor] = useState<string | null>(null);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestDescription, setRequestDescription] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const [subClient, setSubClient] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [subCycle, setSubCycle] = useState<BillingCycle>('MONTHLY');
  const [subNotes, setSubNotes] = useState('');

  const clientsQuery = useQuery({
    queryKey: ['clients', 'billing'],
    queryFn: () => api.clients.list({ pageSize: 200 }),
  });
  const clients = clientsQuery.data?.items ?? [];

  const invoicesQuery = useQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: () => api.billing.invoices.list({ pageSize: 100 }),
  });
  const invoices = invoicesQuery.data?.items ?? [];

  const requestsQuery = useQuery({
    queryKey: ['billing', 'payment-requests'],
    queryFn: () => api.billing.paymentRequests.list(),
  });
  const requests = requestsQuery.data ?? [];

  const subscriptionsQuery = useQuery({
    queryKey: ['billing', 'subscriptions'],
    queryFn: () => api.billing.subscriptions.list(),
  });
  const subscriptions = subscriptionsQuery.data ?? [];

  const requestsByInvoice = useMemo(() => {
    const map = new Map<string, PaymentRequest[]>();
    for (const request of requests) {
      if (!request.invoiceId) continue;
      const list = map.get(request.invoiceId) ?? [];
      list.push(request);
      map.set(request.invoiceId, list);
    }
    return map;
  }, [requests]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['billing'] });
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
  }

  const createInvoice = useMutation({
    mutationFn: () =>
      api.billing.invoices.create({
        clientId,
        type,
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : undefined,
        notes: notes || undefined,
        items: items
          .filter((item) => item.description && Number(item.amount) > 0)
          .map((item) => ({
            description: item.description,
            amount: Number(item.amount),
            filingId: item.filingId || undefined,
          })),
      }),
    onSuccess: () => {
      setShowForm(false);
      setItems([emptyItem()]);
      setNotes('');
      setDueDate('');
      invalidate();
    },
  });

  const updateInvoice = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BillingInvoiceStatus }) =>
      api.billing.invoices.update(id, { status: status as 'ISSUED' | 'VOID' }),
    onSuccess: invalidate,
  });

  const createRequest = useMutation({
    mutationFn: (invoiceId: string) =>
      api.billing.paymentRequests.create({
        invoiceId,
        amount: Number(requestAmount),
        description: requestDescription || undefined,
      }),
    onSuccess: () => {
      setRequestFor(null);
      setRequestAmount('');
      setRequestDescription('');
      invalidate();
    },
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => api.billing.paymentRequests.markPaid(id, { method: 'UPI' }),
    onSuccess: invalidate,
  });

  const removeRequest = useMutation({
    mutationFn: (id: string) => api.billing.paymentRequests.remove(id),
    onSuccess: invalidate,
  });

  const createSubscription = useMutation({
    mutationFn: () =>
      api.billing.subscriptions.create({
        clientId: subClient,
        amount: Number(subAmount),
        cycle: subCycle,
        notes: subNotes || undefined,
      }),
    onSuccess: () => {
      setSubAmount('');
      setSubNotes('');
      invalidate();
    },
  });

  const toggleSubscription = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.billing.subscriptions.update(id, { active }),
    onSuccess: invalidate,
  });

  const removeSubscription = useMutation({
    mutationFn: (id: string) => api.billing.subscriptions.remove(id),
    onSuccess: invalidate,
  });

  async function copyLink(url: string, key: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  const canCreate =
    clientId && items.some((item) => item.description && Number(item.amount) > 0);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Button
          variant={tab === 'invoices' ? 'primary' : 'secondary'}
          onClick={() => setTab('invoices')}
        >
          <Receipt className="h-4 w-4" /> Invoices
        </Button>
        <Button
          variant={tab === 'subscriptions' ? 'primary' : 'secondary'}
          onClick={() => setTab('subscriptions')}
        >
          Subscriptions
        </Button>
      </div>

      {tab === 'invoices' ? (
        <Card>
          <CardHeader
            title="Invoices"
            action={
              <Button onClick={() => setShowForm((value) => !value)}>
                <Plus className="h-4 w-4" /> New invoice
              </Button>
            }
          />
          <div className="space-y-4 p-4">
            {showForm ? (
              <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Field label="Client">
                    <Select value={clientId} onChange={(event) => setClientId(event.target.value)}>
                      <option value="">Select client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Type">
                    <Select
                      value={type}
                      onChange={(event) => setType(event.target.value as BillingInvoiceType)}
                    >
                      {(Object.keys(TYPE_LABEL) as BillingInvoiceType[]).map((value) => (
                        <option key={value} value={value}>
                          {TYPE_LABEL[value]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Due date">
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                  </Field>
                  <Field label="Notes">
                    <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
                  </Field>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">Line items</p>
                  {items.map((item, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <Input
                        className="flex-1"
                        placeholder="Description"
                        value={item.description}
                        onChange={(event) =>
                          setItems(
                            items.map((row, i) =>
                              i === index ? { ...row, description: event.target.value } : row,
                            ),
                          )
                        }
                      />
                      <Input
                        className="w-32"
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Amount"
                        value={item.amount}
                        onChange={(event) =>
                          setItems(
                            items.map((row, i) =>
                              i === index ? { ...row, amount: event.target.value } : row,
                            ),
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        disabled={items.length === 1}
                        onClick={() => setItems(items.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="secondary" onClick={() => setItems([...items, emptyItem()])}>
                    <Plus className="h-4 w-4" /> Add line
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => createInvoice.mutate()}
                    disabled={!canCreate || createInvoice.isPending}
                  >
                    {createInvoice.isPending ? 'Creating...' : 'Create draft invoice'}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                  {createInvoice.isError ? (
                    <span className="text-sm text-red-600">
                      {createInvoice.error instanceof Error
                        ? createInvoice.error.message
                        : 'Failed to create invoice'}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {invoicesQuery.isLoading ? (
              <Spinner label="Loading invoices..." />
            ) : invoices.length === 0 ? (
              <EmptyState
                title="No invoices yet"
                description="Generate a per-filing, cumulative or subscription invoice."
              />
            ) : (
              <div className="space-y-3">
                {invoices.map((invoice: BillingInvoice) => {
                  const invoiceRequests = requestsByInvoice.get(invoice.id) ?? [];
                  return (
                    <div key={invoice.id} className="rounded-md border border-slate-200 bg-white">
                      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-2">
                        <span className="font-mono text-sm font-medium text-slate-800">
                          {invoice.number}
                        </span>
                        <Badge tone={STATUS_TONE[invoice.status]}>{invoice.status}</Badge>
                        <span className="text-xs text-slate-400">{TYPE_LABEL[invoice.type]}</span>
                        <span className="text-sm text-slate-600">{invoice.client?.name}</span>
                        <span className="ml-auto text-sm text-slate-500">
                          {formatMoney(invoice.total)} total &middot;{' '}
                          <span className="text-green-700">{formatMoney(invoice.paid)}</span> paid
                          &middot;{' '}
                          <span className="text-amber-700">
                            {formatMoney(invoice.outstanding)} due
                          </span>
                        </span>
                      </div>
                      {invoice.items?.length ? (
                        <div className="px-3 py-2 text-xs text-slate-500">
                          {invoice.items
                            .map((item) => `${item.description} (${formatMoney(item.amount)})`)
                            .join('  ·  ')}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                        {invoice.status === 'DRAFT' ? (
                          <Button
                            variant="secondary"
                            disabled={updateInvoice.isPending}
                            onClick={() => updateInvoice.mutate({ id: invoice.id, status: 'ISSUED' })}
                          >
                            <Send className="h-3.5 w-3.5" /> Issue
                          </Button>
                        ) : null}
                        {invoice.status !== 'VOID' && invoice.status !== 'PAID' ? (
                          <Button
                            variant="ghost"
                            disabled={updateInvoice.isPending}
                            onClick={() => updateInvoice.mutate({ id: invoice.id, status: 'VOID' })}
                          >
                            <Ban className="h-3.5 w-3.5" /> Void
                          </Button>
                        ) : null}
                        {invoice.status !== 'VOID' ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setRequestFor(invoice.id);
                              setRequestAmount(String(invoice.outstanding ?? invoice.total));
                              setRequestDescription(`Payment for ${invoice.number}`);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" /> Payment link
                          </Button>
                        ) : null}
                      </div>

                      {requestFor === invoice.id ? (
                        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2">
                          <Field label="Amount">
                            <Input
                              className="w-32"
                              type="number"
                              min={0}
                              step="0.01"
                              value={requestAmount}
                              onChange={(event) => setRequestAmount(event.target.value)}
                            />
                          </Field>
                          <Field label="Description">
                            <Input
                              className="w-64"
                              value={requestDescription}
                              onChange={(event) => setRequestDescription(event.target.value)}
                            />
                          </Field>
                          <Button
                            disabled={!requestAmount || createRequest.isPending}
                            onClick={() => createRequest.mutate(invoice.id)}
                          >
                            {createRequest.isPending ? 'Creating...' : 'Create link'}
                          </Button>
                          <Button variant="ghost" onClick={() => setRequestFor(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : null}

                      {invoiceRequests.length ? (
                        <div className="divide-y divide-slate-100 border-t border-slate-100">
                          {invoiceRequests.map((request) => (
                            <div
                              key={request.id}
                              className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                            >
                              <Badge tone={request.status === 'COMPLETED' ? 'success' : 'warning'}>
                                {request.status}
                              </Badge>
                              <span className="text-slate-600">{formatMoney(request.amount)}</span>
                              <span className="text-xs text-slate-400">{request.provider}</span>
                              {request.url ? (
                                <>
                                  <a
                                    href={request.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" /> Open
                                  </a>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
                                    onClick={() => copyLink(request.url!, request.id)}
                                  >
                                    <Copy className="h-3 w-3" />
                                    {copied === request.id ? 'Copied' : 'Copy'}
                                  </button>
                                </>
                              ) : null}
                              <div className="ml-auto flex items-center gap-2">
                                {request.status !== 'COMPLETED' ? (
                                  <Button
                                    variant="secondary"
                                    disabled={markPaid.isPending}
                                    onClick={() => markPaid.mutate(request.id)}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark paid
                                  </Button>
                                ) : null}
                                {request.status !== 'COMPLETED' ? (
                                  <Button
                                    variant="ghost"
                                    disabled={removeRequest.isPending}
                                    onClick={() => removeRequest.mutate(request.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Subscriptions" />
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Field label="Client">
                <Select value={subClient} onChange={(event) => setSubClient(event.target.value)}>
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount (INR)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={subAmount}
                  onChange={(event) => setSubAmount(event.target.value)}
                />
              </Field>
              <Field label="Billing cycle">
                <Select
                  value={subCycle}
                  onChange={(event) => setSubCycle(event.target.value as BillingCycle)}
                >
                  {CYCLES.map((cycle) => (
                    <option key={cycle} value={cycle}>
                      {cycle}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Notes">
                <Input value={subNotes} onChange={(event) => setSubNotes(event.target.value)} />
              </Field>
            </div>
            <Button
              disabled={!subClient || !subAmount || createSubscription.isPending}
              onClick={() => createSubscription.mutate()}
            >
              <Plus className="h-4 w-4" />
              {createSubscription.isPending ? 'Adding...' : 'Add subscription'}
            </Button>

            {subscriptionsQuery.isLoading ? (
              <Spinner label="Loading subscriptions..." />
            ) : subscriptions.length === 0 ? (
              <EmptyState
                title="No subscriptions"
                description="Set up recurring retainers for your clients."
              />
            ) : (
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                      <th className="px-3 py-2 font-medium">Client</th>
                      <th className="px-3 py-2 font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Cycle</th>
                      <th className="px-3 py-2 font-medium">Next due</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((subscription) => (
                      <tr key={subscription.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-800">{subscription.client?.name}</td>
                        <td className="px-3 py-2">{formatMoney(subscription.amount)}</td>
                        <td className="px-3 py-2 text-slate-600">{subscription.cycle}</td>
                        <td className="px-3 py-2 text-slate-500">
                          {formatDateTime(subscription.nextDueDate)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge tone={subscription.active ? 'success' : 'neutral'}>
                            {subscription.active ? 'ACTIVE' : 'PAUSED'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="secondary"
                            disabled={toggleSubscription.isPending}
                            onClick={() =>
                              toggleSubscription.mutate({
                                id: subscription.id,
                                active: !subscription.active,
                              })
                            }
                          >
                            {subscription.active ? 'Pause' : 'Resume'}
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={removeSubscription.isPending}
                            onClick={() => removeSubscription.mutate(subscription.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
