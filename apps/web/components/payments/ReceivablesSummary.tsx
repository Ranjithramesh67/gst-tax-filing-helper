'use client';

import { Card } from '@/components/ui';
import { formatMoney } from '@/components/sms/classification';

export function ReceivablesSummary({
  billed,
  collected,
  outstanding,
  clientsCount,
}: {
  billed: number;
  collected: number;
  outstanding: number;
  clientsCount?: number;
}) {
  const items = [
    { label: 'Billed', value: formatMoney(billed), tone: 'text-slate-900' },
    { label: 'Collected', value: formatMoney(collected), tone: 'text-emerald-600' },
    { label: 'Outstanding', value: formatMoney(outstanding), tone: 'text-amber-600' },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="p-4">
          <div className="text-sm text-slate-500">{item.label}</div>
          <div className={`mt-1 text-2xl font-semibold ${item.tone}`}>{item.value}</div>
        </Card>
      ))}
      {clientsCount !== undefined ? (
        <Card className="p-4">
          <div className="text-sm text-slate-500">Clients with dues</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{clientsCount}</div>
        </Card>
      ) : null}
    </div>
  );
}
