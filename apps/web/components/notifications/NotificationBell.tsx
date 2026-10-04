'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { useFirmPath } from '@/lib/firm';

export function NotificationBell() {
  const to = useFirmPath();
  const query = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.notifications.unreadCount(),
    refetchInterval: 60_000,
  });
  const count = query.data?.count ?? 0;

  return (
    <Link
      href={to('/notifications')}
      className="relative inline-flex items-center justify-center rounded-md p-2 text-slate-600 hover:bg-slate-100"
      aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
    >
      <Bell className="h-5 w-5" />
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
