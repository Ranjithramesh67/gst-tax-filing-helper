'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useFirmPath } from '@/lib/firm';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { formatDateTime } from '@/components/sms/classification';

export default function SmsOtpDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const to = useFirmPath();

  const group = useQuery({
    queryKey: ['inbox', id],
    queryFn: () => api.inbox.get(id),
    enabled: Boolean(id),
  });

  if (group.isLoading) {
    return <Spinner label="Loading OTP..." />;
  }

  if (group.isError) {
    return (
      <div>
        <Link
          href={to('/sms')}
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back to inbox
        </Link>
        <Card className="px-4 py-10 text-center text-sm text-red-600">
          {group.error instanceof Error ? group.error.message : 'Failed to load OTP'}
        </Card>
      </div>
    );
  }

  if (!group.data) {
    return (
      <Card>
        <EmptyState title="OTP not found" description="This OTP group may have been removed." />
      </Card>
    );
  }

  const detail = group.data;
  const firstAt = detail.events[0]?.receivedAt;

  return (
    <div>
      <Link
        href={to('/sms')}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to inbox
      </Link>

      <PageHeader
        title="OTP Code"
        description={`${detail.client.name || '-'}${firstAt ? ` \u00b7 first seen ${formatDateTime(firstAt)}` : ''}`}
        action={
          <span className="font-mono text-lg font-bold tracking-widest text-slate-900">
            {detail.code}
          </span>
        }
      />

      <Card>
        <CardHeader title={`Events (${detail.events.length})`} />
        <ul className="divide-y divide-slate-100">
          {detail.events.map((event) => (
            <li key={event.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge tone={event.source === 'EMAIL' ? 'info' : 'neutral'}>
                    {event.source === 'EMAIL' ? 'Email' : 'SMS'}
                  </Badge>
                  <span className="text-sm font-medium text-slate-800">
                    {event.from ?? 'Unknown sender'}
                  </span>
                </div>
                <span className="text-xs text-slate-400">{formatDateTime(event.receivedAt)}</span>
              </div>
              {event.subject ? (
                <p className="mt-1 text-sm text-slate-700">{event.subject}</p>
              ) : null}
              {event.snippet ? (
                <p className="mt-1 text-sm text-slate-500">{event.snippet}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
