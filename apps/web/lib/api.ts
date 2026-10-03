import { GstFlowApi } from '@gstflow/api-client';

const TOKEN_KEY = 'gstflow.web.access';
const REFRESH_KEY = 'gstflow.web.refresh';

export const tokenStore = {
  getAccess(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(TOKEN_KEY);
  },
  getRefresh(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(REFRESH_KEY);
  },
  set(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TOKEN_KEY, accessToken);
    window.localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  },
};

export const api = new GstFlowApi({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? '/api',
  getAccessToken: () => tokenStore.getAccess(),
  getRefreshToken: () => tokenStore.getRefresh(),
  onTokensRefreshed: (tokens) => tokenStore.set(tokens.accessToken, tokens.refreshToken),
  onUnauthorized: () => {
    tokenStore.clear();
    if (typeof window !== 'undefined' && !window.location.pathname.endsWith('/login')) {
      const segment = window.location.pathname.split('/').filter(Boolean)[0];
      const reserved = new Set(['login', 'api', 'admin', '_next']);
      window.location.href = segment && !reserved.has(segment) ? `/${segment}/login` : '/login';
    }
  },
});
