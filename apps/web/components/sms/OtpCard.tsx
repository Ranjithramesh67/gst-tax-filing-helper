import type { InboxItem } from '@gstflow/types';
import { Badge } from '@/components/ui';

export function OtpCard({ item }: { item: Extract<InboxItem, { kind: 'OTP' }> }) {
  return (
    <div className="flex items-start gap-3">
      <span className="font-mono text-lg font-bold tracking-widest text-slate-900">{item.code}</span>
      <div className="flex flex-wrap gap-1">
        {item.sources.map((s) => (
          <Badge key={s} tone={s === 'EMAIL' ? 'info' : 'neutral'}>
            {s === 'EMAIL' ? 'Email' : 'SMS'}
          </Badge>
        ))}
        {item.eventCount > 1 ? (
          <span className="text-xs text-slate-400">x{item.eventCount}</span>
        ) : null}
      </div>
    </div>
  );
}
