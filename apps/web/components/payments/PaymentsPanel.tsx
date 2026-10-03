'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, Save, Trash2 } from 'lucide-react';
import type { CreatePaymentBody, Payment, PaymentMethod, PaymentState, PaymentStatus } from '@gstflow/types';
import { api } from '@/lib/api';
import { Badge, Button, EmptyState, Field, Input, Select, Spinner } from '@/components/ui';
import { formatDateTime, formatMoney } from '@/components/sms/classification';

const STATUSES: PaymentStatus[] = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'];
const METHODS: PaymentMethod[] = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER'];

const STATUS_TONE: Record<PaymentStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  PENDING: 'warning',
  COMPLETED: 'success',
  FAILED: 'danger',
  REFUNDED: 'info',
};

const STATE_TONE: Record<PaymentState, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  NONE: 'neutral',
  UNPAID: 'danger',
  PARTIAL: 'warning',
  PAID: 'success',
};

export function deriveState(fee: number | null | undefined, paid: number): PaymentState {
  if (fee === null || fee === undefined) return 'NONE';
  if (paid <= 0) return 'UNPAID';
  if (paid < fee) return 'PARTIAL';
  return 'PAID';
}

function emptyForm(): CreatePaymentBody & { status: PaymentStatus } {
  return { amount: 0, status: 'COMPLETED', method: 'UPI', paidAt: undefined, reference: '', notes: '' };
}

export function PaymentsPanel({
  filingId,
  feeAmount,
}: {
  filingId: string;
  feeAmount?: number | null;
}) {
  const queryClient = useQueryClient();
  const [fee, setFee] = useState(feeAmount === null || feeAmount === undefined ? '' : String(feeAmount));
  const [form, setForm] = useState(emptyForm());
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    setFee(feeAmount === null || feeAmount === undefined ? '' : String(feeAmount));
  }, [feeAmount]);

  const paymentsQuery = useQuery({
    queryKey: ['filings', filingId, 'payments'],
    queryFn: () => api.filings.payments(filingId),
  });
  const payments = paymentsQuery.data ?? [];

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['filings'] });
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
  }

  const saveFee = useMutation({
    mutationFn: () => api.filings.update(filingId, { feeAmount: Number(fee) || 0 }),
    onSuccess: invalidate,
  });

  const addPayment = useMutation({
    mutationFn: () =>
      api.filings.addPayment(filingId, {
        amount: Number(form.amount) || 0,
        status: form.status,
        method: form.method,
        paidAt: form.paidAt,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      setForm(emptyForm());
      invalidate();
    },
  });

  const updatePayment = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PaymentStatus }) =>
      api.payments.update(id, { status }),
    onSuccess: invalidate,
  });

  const removePayment = useMutation({
    mutationFn: (id: string) => api.payments.remove(id),
    onSuccess: invalidate,
  });

  const addLink = useMutation({
    mutationFn: ({ id }: { id: string }) => api.payments.addLink(id, { label: linkLabel, url: linkUrl }),
    onSuccess: () => {
      setLinkTarget(null);
      setLinkLabel('');
      setLinkUrl('');
      invalidate();
    },
  });

  const removeLink = useMutation({
    mutationFn: ({ id, linkId }: { id: string; linkId: string }) =>
      api.payments.removeLink(id, linkId),
    onSuccess: invalidate,
  });

  const feeValue = fee === '' ? null : Number(fee);
  const paid = payments
    .filter((payment) => payment.status === 'COMPLETED')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const state = deriveState(feeValue, paid);
  const balance = feeValue === null ? 0 : Math.max(feeValue - paid, 0);

  const canAdd = Number(form.amount) > 0 && !addPayment.isPending;

  return (
    <div className="space-y-4 bg-slate-50 px-4 py-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Fee amount (INR)">
          <Input
            type="number"
            min={0}
            step="0.01"
            className="w-40"
            value={fee}
            onChange={(event) => setFee(event.target.value)}
            placeholder="0"
          />
        </Field>
        <Button variant="secondary" onClick={() => saveFee.mutate()} disabled={saveFee.isPending}>
          <Save className="h-4 w-4" /> {saveFee.isPending ? 'Saving...' : 'Save fee'}
        </Button>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <Badge tone={STATE_TONE[state]}>{state}</Badge>
          <span className="text-slate-500">
            Paid <strong className="text-slate-800">{formatMoney(paid)}</strong>
          </span>
          <span className="text-slate-500">
            Balance <strong className="text-slate-800">{formatMoney(balance)}</strong>
          </span>
        </div>
      </div>
      {saveFee.isError ? (
        <p className="text-sm text-red-600">
          {saveFee.error instanceof Error ? saveFee.error.message : 'Failed to save fee'}
        </p>
      ) : null}

      {paymentsQuery.isLoading ? (
        <Spinner label="Loading payments..." />
      ) : paymentsQuery.isError ? (
        <p className="text-sm text-red-600">
          {paymentsQuery.error instanceof Error ? paymentsQuery.error.message : 'Failed to load payments'}
        </p>
      ) : payments.length === 0 ? (
        <EmptyState title="No payments recorded" description="Add the first payment below." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Paid at</th>
                <th className="px-3 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 font-medium">Proof</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment: Payment) => (
                <tr key={payment.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="px-3 py-2 font-medium text-slate-800">{formatMoney(payment.amount)}</td>
                  <td className="px-3 py-2">
                    <Select
                      className="w-32"
                      value={payment.status}
                      disabled={updatePayment.isPending}
                      onChange={(event) =>
                        updatePayment.mutate({ id: payment.id, status: event.target.value as PaymentStatus })
                      }
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{payment.method ?? '-'}</td>
                  <td className="px-3 py-2 text-slate-500">{formatDateTime(payment.paidAt)}</td>
                  <td className="px-3 py-2 text-slate-500">{payment.reference ?? '-'}</td>
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      {(payment.links ?? []).map((link) => (
                        <div key={link.id} className="flex items-center gap-2 text-xs">
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-700 hover:underline"
                          >
                            {link.label}
                          </a>
                          <button
                            type="button"
                            className="text-slate-400 hover:text-red-600"
                            onClick={() => removeLink.mutate({ id: payment.id, linkId: link.id })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {linkTarget === payment.id ? (
                        <div className="flex flex-col gap-1">
                          <Input
                            className="w-40"
                            placeholder="Label"
                            value={linkLabel}
                            onChange={(event) => setLinkLabel(event.target.value)}
                          />
                          <Input
                            className="w-56"
                            placeholder="https://..."
                            value={linkUrl}
                            onChange={(event) => setLinkUrl(event.target.value)}
                          />
                          <div className="flex gap-1">
                            <Button
                              variant="secondary"
                              disabled={!linkLabel || !linkUrl || addLink.isPending}
                              onClick={() => addLink.mutate({ id: payment.id })}
                            >
                              Add
                            </Button>
                            <Button variant="ghost" onClick={() => setLinkTarget(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700"
                          onClick={() => setLinkTarget(payment.id)}
                        >
                          <Link2 className="h-3 w-3" /> Proof link
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="danger"
                      disabled={removePayment.isPending}
                      onClick={() => removePayment.mutate(payment.id)}
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

      <div className="rounded-md border border-slate-200 bg-white p-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-800">Add payment</h4>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Field label="Amount">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.amount || ''}
              onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })}
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value as PaymentStatus })}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Method">
            <Select
              value={form.method ?? 'UPI'}
              onChange={(event) => setForm({ ...form, method: event.target.value as PaymentMethod })}
            >
              {METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Paid at">
            <Input
              type="date"
              value={form.paidAt ? form.paidAt.slice(0, 10) : ''}
              onChange={(event) =>
                setForm({
                  ...form,
                  paidAt: event.target.value ? new Date(`${event.target.value}T00:00:00.000Z`).toISOString() : undefined,
                })
              }
            />
          </Field>
          <Field label="Reference">
            <Input
              value={form.reference ?? ''}
              onChange={(event) => setForm({ ...form, reference: event.target.value })}
            />
          </Field>
          <Field label="Notes">
            <Input value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={() => addPayment.mutate()} disabled={!canAdd}>
            <Plus className="h-4 w-4" /> {addPayment.isPending ? 'Adding...' : 'Add payment'}
          </Button>
          <Badge tone={STATUS_TONE[form.status]}>{form.status}</Badge>
          {addPayment.isError ? (
            <span className="text-sm text-red-600">
              {addPayment.error instanceof Error ? addPayment.error.message : 'Failed to add payment'}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
