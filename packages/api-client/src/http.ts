export type QueryParams = object;

export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  getRefreshToken?: () => string | null | undefined | Promise<string | null | undefined>;
  onTokensRefreshed?: (tokens: { accessToken: string; refreshToken: string }) => void | Promise<void>;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  statusCode: number;
  body: unknown;
  requestId?: string;

  constructor(statusCode: number, message: string, body?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.body = body;
    this.requestId = requestId;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: QueryParams;
  body?: unknown;
  formData?: FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipAuth?: boolean;
}

function buildQuery(query?: QueryParams): string {
  if (!query) return '';
  // Built manually instead of URLSearchParams: React Native's (Hermes) polyfill
  // does not implement `set` and throws "URLSearchParams.set is not implemented".
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class ApiClient {
  private config: ApiClientConfig;
  private refreshPromise: Promise<boolean> | null = null;
  /**
   * Tokens live in memory after a refresh. Relying only on the async storage
   * callback is racy: the retried request could read the previous (now expired)
   * access token before `onTokensRefreshed` finishes persisting, triggering a
   * second refresh with the rotated-away refresh token and logging the user out.
   */
  private currentTokens: TokenPair | null = null;

  constructor(config: ApiClientConfig) {
    this.config = config;
  }

  /** Seeds the in-memory token cache (e.g. right after sign-in). */
  setTokens(tokens: TokenPair): void {
    this.currentTokens = tokens;
  }

  /** Drops the in-memory token cache (e.g. on sign-out or failed refresh). */
  clearTokens(): void {
    this.currentTokens = null;
  }

  private get fetchImpl(): typeof fetch {
    if (this.config.fetchImpl) return this.config.fetchImpl;
    return (...args: Parameters<typeof fetch>) => fetch(...args);
  }

  private async accessToken(): Promise<string | null | undefined> {
    if (this.currentTokens) return this.currentTokens.accessToken;
    return this.config.getAccessToken?.();
  }

  private async refreshToken(): Promise<string | null | undefined> {
    if (this.currentTokens) return this.currentTokens.refreshToken;
    return this.config.getRefreshToken?.();
  }

  private async authHeader(skipAuth?: boolean): Promise<Record<string, string>> {
    if (skipAuth) return {};
    const token = await this.accessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const doFetch = async (): Promise<Response> => {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(await this.authHeader(options.skipAuth)),
        ...options.headers,
      };
      let body: BodyInit | undefined;
      if (options.formData) {
        body = options.formData;
      } else if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
      }
      const url = `${this.config.baseUrl}${options.path}${buildQuery(options.query)}`;
      return this.fetchImpl(url, {
        method: options.method ?? 'GET',
        headers,
        body,
        signal: options.signal,
      });
    };

    let res = await doFetch();

    if (res.status === 401 && !options.skipAuth) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        res = await doFetch();
      } else {
        this.currentTokens = null;
        this.config.onUnauthorized?.();
      }
    }

    const text = await res.text();
    const data = text ? safeJson(text) : undefined;

    if (!res.ok) {
      const message =
        (data && typeof data === 'object' && 'message' in data
          ? Array.isArray((data as { message: unknown }).message)
            ? ((data as { message: unknown[] }).message as unknown[]).join(', ')
            : String((data as { message: unknown }).message)
          : res.statusText) || 'Request failed';
      throw new ApiError(res.status, String(message), data, res.headers.get('x-request-id') ?? undefined);
    }

    return data as T;
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.config.getRefreshToken || !this.config.onTokensRefreshed) return false;
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const refreshToken = await this.refreshToken();
        if (!refreshToken) return false;
        const res = await this.fetchImpl(`${this.config.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const tokens = (await res.json()) as TokenPair;
        // Publish the new tokens in memory first so any retried request uses
        // them immediately, then persist and only resolve afterwards. A
        // persistence failure must never turn a successful refresh into a
        // forced logout, so it is swallowed.
        this.currentTokens = tokens;
        try {
          await this.config.onTokensRefreshed?.(tokens);
        } catch {
          void 0;
        }
        return true;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  get<T>(path: string, query?: RequestOptions['query'], options?: Partial<RequestOptions>) {
    return this.request<T>({ method: 'GET', path, query, ...options });
  }
  post<T>(path: string, body?: unknown, options?: Partial<RequestOptions>) {
    return this.request<T>({ method: 'POST', path, body, ...options });
  }
  patch<T>(path: string, body?: unknown, options?: Partial<RequestOptions>) {
    return this.request<T>({ method: 'PATCH', path, body, ...options });
  }
  put<T>(path: string, body?: unknown, options?: Partial<RequestOptions>) {
    return this.request<T>({ method: 'PUT', path, body, ...options });
  }
  del<T>(path: string, options?: Partial<RequestOptions>) {
    return this.request<T>({ method: 'DELETE', path, ...options });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
