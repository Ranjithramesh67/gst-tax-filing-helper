'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { FirmBranding } from '@gstflow/types';

const FirmBrandingContext = createContext<FirmBranding | null>(null);

export function FirmBrandingProvider({
  branding,
  children,
}: {
  branding: FirmBranding;
  children: ReactNode;
}) {
  return <FirmBrandingContext.Provider value={branding}>{children}</FirmBrandingContext.Provider>;
}

export function useFirmBranding(): FirmBranding | null {
  return useContext(FirmBrandingContext);
}

const RESERVED = new Set([
  'login',
  'logout',
  'api',
  'admin',
  '_next',
  'public',
  'assets',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
]);

export function currentFirmSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const segment = window.location.pathname.split('/').filter(Boolean)[0];
  return segment && !RESERVED.has(segment) ? segment : null;
}

export function firmHref(slug: string | null, path: string): string {
  const clean = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return slug ? `/${slug}${clean}` : clean || '/';
}

export function useFirmPath(): (path: string) => string {
  const branding = useFirmBranding();
  return (path: string) => firmHref(branding?.slug ?? null, path);
}
