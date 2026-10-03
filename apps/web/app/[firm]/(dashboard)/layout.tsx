'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
  CalendarClock,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  Paperclip,
  Receipt,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useFirmBranding, useFirmPath } from '@/lib/firm';
import { cn } from '@/components/ui';

const NAV: Array<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: string;
}> = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/sms', label: 'SMS Inbox', icon: Mail },
  { href: '/documents', label: 'Documents', icon: Paperclip },
  { href: '/filings', label: 'Filings', icon: FileText },
  { href: '/deadlines', label: 'Deadlines', icon: CalendarClock },
  { href: '/billing', label: 'Billing', icon: Receipt },
  { href: '/receivables', label: 'Receivables', icon: Wallet },
  { href: '/team', label: 'Team', icon: UserCog, permission: 'users:read' },
  { href: '/roles', label: 'Roles', icon: ShieldCheck, permission: 'roles:read' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const branding = useFirmBranding();
  const to = useFirmPath();
  const pathname = usePathname();
  const router = useRouter();
  const slug = branding?.slug ?? '';

  useEffect(() => {
    if (!loading && !user) router.replace(`/${slug}/login`);
  }, [loading, user, router, slug]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>;
  }
  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.name} className="h-8 w-8 rounded object-contain" />
          ) : null}
          <div>
            <span className="text-base font-semibold text-slate-900">{branding?.name ?? 'GSTFlow'}</span>
            <p className="text-xs text-slate-400">Firm console</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.filter(
            (item) => !item.permission || user.permissions?.includes(item.permission),
          ).map((item) => {
            const href = to(item.href);
            const active = pathname === href || (item.href !== '/' && pathname.startsWith(href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                  active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
                )}
                style={active && branding?.brandColor ? { color: branding.brandColor } : undefined}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header
          className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3"
          style={branding?.brandColor ? { borderTop: `3px solid ${branding.brandColor}` } : undefined}
        >
          <div className="text-sm text-slate-500">
            {user.name} &middot; {user.roleName ?? user.role}
          </div>
          <button
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
