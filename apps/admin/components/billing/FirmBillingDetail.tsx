'use client';

import { useQuery } from '@tanstack/react-query';
import type { FirmBillingSummary } from '@gstflow/types';
import { api } from '@/lib/api';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    value,
  );
}

export function FirmBillingDetail({
  firm,
  onClose,
}: {
  firm: FirmBillingSummary;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ['admin', 'billing', firm.firmId],
    queryFn: () => api.admin.billing.firm(firm.firmId),
  });

  const clients = query.data?.clients ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <Card className="my-8 w-full max-w-3xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{firm.firmName}</h3>
            <p className="mt-0.5 text-xs text-slate-400">/{firm.slug} · billing detail</p>
          </div>
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs uppercase text-slate-400">Billed</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{formatMoney(query.data?.billed ?? firm.billed)}</div>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs uppercase text-slate-400">Collected</div>
            <div className="mt-1 text-lg font-semibold text-green-600">
              {formatMoney(query.data?.collected ?? firm.collected)}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 p-3">
            <div className="text-xs uppercase text-slate-400">Outstanding</div>
            <div className="mt-1 text-lg font-semibold text-amber-600">
              {formatMoney(query.data?.outstanding ?? firm.outstanding)}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200">
          {query.isLoading ? (
            <div className="px-4">
              <Spinner label="Loading clients..." />
            </div>
          ) : query.isError ? (
            <p className="p-4 text-sm text-red-600">Failed to load billing detail.</p>
          ) : clients.length === 0 ? (
            <EmptyState title="No billable clients" description="This firm has no filings with fees yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Filings</th>
                    <th className="px-4 py-3 font-medium">Billed</th>
                    <th className="px-4 py-3 font-medium">Collected</th>
                    <th className="px-4 py-3 font-medium">Outstanding</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.clientId} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 text-slate-700">{client.clientName}</td>
                      <td className="px-4 py-3 text-slate-500">{client.filingsCount}</td>
                      <td className="px-4 py-3 text-slate-600">{formatMoney(client.billed)}</td>
                      <td className="px-4 py-3 text-green-600">{formatMoney(client.collected)}</td>
                      <td className="px-4 py-3 font-medium text-amber-600">{formatMoney(client.outstanding)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={client.outstanding > 0 ? 'warning' : 'success'}>
                          {client.outstanding > 0 ? 'DUE' : 'CLEARED'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
