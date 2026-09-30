'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Building2, ScrollText, Smartphone, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, PageHeader } from '@/components/ui';

export default function AdminDashboardPage() {
  const firms = useQuery({ queryKey: ['admin', 'firms', 'count'], queryFn: () => api.admin.firms.list({ pageSize: 1 }) });
  const users = useQuery({ queryKey: ['admin', 'users', 'count'], queryFn: () => api.admin.users.list({ pageSize: 1 }) });
  const releases = useQuery({
    queryKey: ['admin', 'releases', 'count'],
    queryFn: () => api.admin.releases.list({ pageSize: 1 }),
  });
  const audit = useQuery({ queryKey: ['admin', 'audit', 'count'], queryFn: () => api.admin.audit.list({ pageSize: 1 }) });

  const stats = [
    { label: 'Firms', value: firms.data?.total, href: '/firms', icon: Building2 },
    { label: 'Users', value: users.data?.total, href: '/users', icon: Users },
    { label: 'App releases', value: releases.data?.total, href: '/releases', icon: Smartphone },
    { label: 'Audit events', value: audit.data?.total, href: '/audit', icon: ScrollText },
  ];

  return (
    <div>
      <PageHeader title="Platform overview" description="Distribute the client app and manage firms." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="p-4 transition hover:border-brand-500">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">{stat.label}</span>
                  <Icon className="h-4 w-4 text-brand-600" />
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {stat.value ?? <span className="text-slate-300">-</span>}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      <Card className="mt-6 p-5">
        <h2 className="text-sm font-semibold text-slate-800">Distributing the mobile app</h2>
        <p className="mt-2 text-sm text-slate-600">
          Publish a build under <span className="font-medium">App Releases</span> with its download URL.
          Firm staff share that link with clients. Clients install, enter the phone number registered by
          their firm, verify the OTP and grant consent before any SMS is forwarded.
        </p>
      </Card>
    </div>
  );
}
