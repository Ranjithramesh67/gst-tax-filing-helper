'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFirmPath } from '@/lib/firm';
import { Card, CardHeader, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { ReceivablesSummary } from '@/components/payments/ReceivablesSummary';
import { formatMoney } from '@/components/sms/classification';

export default function ReceivablesPage() {
  const to = useFirmPath();
  const query = useQuery({
    queryKey: ['payments', 'receivables'],
    queryFn: () => api.payments.receivables(),
  });

  const data = query.data;
  const clients = data?.clients ?? [];
  const withDues = clients.filter((client) => client.outstanding > 0);

  return (
    <div>
      <PageHeader
        title="Receivables"
        description="Track fees billed, collected and outstanding across your clients."
      />

      {query.isLoading ? (
        <Spinner label="Loading receivables..." />
      ) : query.isError ? (
        <Card className="px-4 py-6 text-sm text-red-600">
          {query.error instanceof Error ? query.error.message : 'Failed to load receivables'}
        </Card>
      ) : (
        <div className="space-y-6">
          <ReceivablesSummary
            billed={data?.billed ?? 0}
            collected={data?.collected ?? 0}
            outstanding={data?.outstanding ?? 0}
          />

          <Card>
            <CardHeader title="By client" />
            {clients.length === 0 ? (
              <EmptyState
                title="No billing yet"
                description="Add fees to filings to start tracking receivables."
              />
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
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => (
                      <tr key={client.clientId} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 text-slate-700">{client.clientName}</td>
                        <td className="px-4 py-3 text-slate-500">{client.filingsCount}</td>
                        <td className="px-4 py-3 text-slate-700">{formatMoney(client.billed)}</td>
                        <td className="px-4 py-3 text-emerald-600">{formatMoney(client.collected)}</td>
                        <td className="px-4 py-3 font-medium text-amber-600">
                          {formatMoney(client.outstanding)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={to(`/clients/${client.clientId}`)}
                            className="text-sm text-brand-700 hover:underline"
                          >
                            View client
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {withDues.length > 0 ? (
            <p className="text-sm text-slate-500">
              {withDues.length} client{withDues.length === 1 ? '' : 's'} with outstanding balances.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
