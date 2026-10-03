import { notFound } from 'next/navigation';
import { getFirmBranding } from '@/lib/branding';
import { FirmBrandingProvider } from '@/lib/firm';

export default async function FirmLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { firm: string };
}) {
  const branding = await getFirmBranding(params.firm);
  if (!branding) notFound();

  if (branding.status === 'SUSPENDED') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-lg border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-slate-900">{branding.name}</h1>
          <p className="mt-2 text-sm text-slate-500">
            This account is currently suspended. Please contact support.
          </p>
          {branding.supportEmail ? (
            <p className="mt-1 text-sm text-slate-500">{branding.supportEmail}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return <FirmBrandingProvider branding={branding}>{children}</FirmBrandingProvider>;
}
