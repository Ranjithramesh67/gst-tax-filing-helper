'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import type { AppNotification } from '@gstflow/types';
import { api } from '@/lib/api';
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Spinner, cn } from '@/components/ui';

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.notifications.list({ pageSize: 100 }),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const items = notificationsQuery.data?.items ?? [];
  const unread = items.filter((item) => !item.readAt).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Due-date reminders and updates for your firm."
        action={
          unread > 0 ? (
            <Button
              variant="secondary"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              <CheckCheck className="h-4 w-4" />
              {markAll.isPending ? 'Marking...' : 'Mark all read'}
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="Recent"
          action={
            notificationsQuery.isSuccess ? (
              <span className="text-xs text-slate-400">
                {unread > 0 ? `${unread} unread` : 'All caught up'}
              </span>
            ) : null
          }
        />

        {notificationsQuery.isLoading ? (
          <Spinner label="Loading notifications..." />
        ) : notificationsQuery.isError ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-red-600">
              {errorMessage(notificationsQuery.error, 'Failed to load notifications.')}
            </p>
            <Button
              variant="secondary"
              className="mt-3"
              onClick={() => void notificationsQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No notifications" description="You are all caught up." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item: AppNotification) => (
              <li
                key={item.id}
                className={cn('flex items-start gap-3 px-4 py-3', !item.readAt && 'bg-brand-50/40')}
              >
                <div className="mt-0.5">
                  <Bell
                    className={cn('h-4 w-4', item.readAt ? 'text-slate-300' : 'text-brand-600')}
                  />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn('text-sm', item.readAt ? 'text-slate-600' : 'font-semibold text-slate-900')}>
                      {item.title}
                    </p>
                    {!item.readAt ? <Badge tone="info">New</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{item.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(item.createdAt)}</p>
                </div>
                {!item.readAt ? (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate(item.id)}
                  >
                    Mark read
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
