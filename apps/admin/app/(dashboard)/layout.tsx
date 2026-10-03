'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Building2, LayoutDashboard, LogOut, ScrollText, ShieldCheck, Smartphone, Users, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/components/ui';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/firms', label: 'Firms', icon: Building2 },
  { href: '/billing', label: 'Billing', icon: Wallet },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/roles', label: 'Roles', icon: ShieldCheck },
  { href: '/releases', label: 'App Releases', icon: Smartphone },
  { href: '/audit', label: 'Audit Log', icon: ScrollText },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>;
  }
  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-ink-900">
      <aside className="hidden w-60 flex-col border-r border-ink-600 bg-ink-800 md:flex">
        <div className="px-5 py-5">
          <span className="keera-text-gradient font-headline text-lg font-bold">KeeRa</span>
          <p className="text-xs text-slate-500">Control Plane</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition',
                  active ? 'bg-brand-500/15 text-brand-300' : 'text-slate-300 hover:bg-ink-700',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-600 bg-ink-800 px-6 py-3">
          <div className="border-t-2 border-transparent pt-0 text-sm text-slate-400">
            {user.name} &middot; <span className="text-brand-300">{user.role}</span>
          </div>
          <button
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-ink-700"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </header>
        <main className="keera-scroll flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
