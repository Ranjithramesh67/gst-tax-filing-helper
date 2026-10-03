import type { FirmBranding } from '@gstflow/types';

export async function getFirmBranding(slug: string): Promise<FirmBranding | null> {
  const base = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';
  try {
    const res = await fetch(`${base}/v1/public/firms/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as FirmBranding;
  } catch {
    return null;
  }
}
