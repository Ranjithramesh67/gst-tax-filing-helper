'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import type { FirmBillingSummary } from '@gstflow/types';
import { api } from '@/lib/api';
import { Button, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { FirmBillingDetail } from '@/components/billing/FirmBillingDetail';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    value,
  );
}

export default function BillingPage() {
  const [selected, setSelected] = useState<FirmBillingSummary | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'billing'],
    queryFn: () => api.admin.billing.platform(),
  });

  const firms = query.data ?? [];
  const totals = firms.reduce(
    (acc, firm) => ({
      billed: acc.billed + firm.billed,
      collected: acc.collected + firm.collected,
      outstanding: acc.outstanding + firm.outstanding,
    }),
    { billed: 0, collected: 0, outstanding: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Platform-wide fees billed, collected and outstanding per firm."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-sm text-slate-500">Billed</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{formatMoney(totals.billed)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">Collected</div>
          <div className="mt-1 text-2xl font-semibold text-green-600">{formatMoney(totals.collected)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500">Outstanding</div>
          <div className="mt-1 text-2xl font-semibold text-amber-600">{formatMoney(totals.outstanding)}</div>
        </Card>
      </div>

      <Card>
        {query.isLoading ? (
          <Spinner label="Loading billing..." />
        ) : query.isError ? (
          <p className="p-6 text-sm text-red-600">Failed to load billing data.</p>
        ) : firms.length === 0 ? (
          <EmptyState title="No firms yet" description="Create firms and add filing fees to track billing." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Firm</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Filings</th>
                  <th className="px-4 py-3 font-medium">Payments</th>
                  <th className="px-4 py-3 font-medium">Billed</th>
                  <th className="px-4 py-3 font-medium">Collected</th>
                  <th className="px-4 py-3 font-medium">Outstanding</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {firms.map((firm) => (
                  <tr key={firm.firmId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{firm.firmName}</td>
                    <td className="px-4 py-3 text-slate-500">{firm.slug}</td>
                    <td className="px-4 py-3 text-slate-500">{firm.filingsCount}</td>
                    <td className="px-4 py-3 text-slate-500">{firm.paymentsCount}</td>
                    <td className="px-4 py-3 text-slate-600">{formatMoney(firm.billed)}</td>
                    <td className="px-4 py-3 text-green-600">{formatMoney(firm.collected)}</td>
                    <td className="px-4 py-3 font-medium text-amber-600">{formatMoney(firm.outstanding)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" onClick={() => setSelected(firm)}>
                        <Eye className="h-4 w-4" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected ? <FirmBillingDetail firm={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
