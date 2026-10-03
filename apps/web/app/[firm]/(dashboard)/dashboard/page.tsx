'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, Mail, Paperclip, Users, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFirmPath } from '@/lib/firm';
import { Card, PageHeader, Spinner } from '@/components/ui';

export default function DashboardPage() {
  const { user } = useAuth();
  const to = useFirmPath();

  const clients = useQuery({ queryKey: ['clients', 'count'], queryFn: () => api.clients.list({ pageSize: 1 }) });
  const sms = useQuery({ queryKey: ['sms', 'count'], queryFn: () => api.sms.list({ pageSize: 1 }) });
  const docs = useQuery({ queryKey: ['documents', 'count'], queryFn: () => api.documents.list({ pageSize: 1 }) });
  const filings = useQuery({
    queryKey: ['filings', 'count'],
    queryFn: () => api.filings.list({ pageSize: 1 }),
  });
  const receivables = useQuery({
    queryKey: ['payments', 'receivables'],
    queryFn: () => api.payments.receivables(),
  });

  const stats = [
    { label: 'Clients', value: clients.data?.total, href: '/clients', icon: Users },
    { label: 'SMS received', value: sms.data?.total, href: '/sms', icon: Mail },
    { label: 'Documents', value: docs.data?.total, href: '/documents', icon: Paperclip },
    { label: 'Filings', value: filings.data?.total, href: '/filings', icon: FileText },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name ?? 'there'}`}
        description="Review incoming client SMS, attach documents and file GST returns."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={to(stat.href)}>
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
      <Link href={to('/receivables')}>
        <Card className="mt-4 flex items-center justify-between p-4 transition hover:border-brand-500">
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-brand-600" />
            <div>
              <div className="text-sm text-slate-500">Outstanding receivables</div>
              <div className="text-2xl font-semibold text-slate-900">
                {receivables.data
                  ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
                      receivables.data.outstanding,
                    )
                  : <span className="text-slate-300">-</span>}
              </div>
            </div>
          </div>
          <span className="text-sm text-slate-400">
            {receivables.data ? `${receivables.data.clients.length} clients` : ''}
          </span>
        </Card>
      </Link>
      {clients.isLoading || sms.isLoading ? <Spinner /> : null}
      <Card className="mt-6 p-5">
        <h2 className="text-sm font-semibold text-slate-800">Getting started</h2>
        <ol className="mt-3 space-y-2 text-sm text-slate-600">
          <li>1. Add your clients under Clients.</li>
          <li>2. Ask the client to install the mobile app and verify via OTP to grant consent.</li>
          <li>3. GST-related SMS from that client appear automatically in the SMS Inbox.</li>
          <li>4. Review the message, attach bills / tax-filed copies, then create and file the return.</li>
        </ol>
      </Card>
    </div>
  );
}
