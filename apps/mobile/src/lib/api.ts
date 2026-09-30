import { GstFlowApi } from '@gstflow/api-client';
import { API_BASE_URL } from '@/config';
import { clearStoredSession, getStoredSession, updateStoredTokens } from './storage';

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export const api = new GstFlowApi({
  baseUrl: API_BASE_URL,
  getAccessToken: async () => {
    const session = await getStoredSession();
    return session?.accessToken ?? null;
  },
  getRefreshToken: async () => {
    const session = await getStoredSession();
    return session?.refreshToken ?? null;
  },
  onTokensRefreshed: (tokens) => {
    void updateStoredTokens(tokens);
  },
  onUnauthorized: () => {
    void clearStoredSession();
    unauthorizedHandler?.();
  },
});
