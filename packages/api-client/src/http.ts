export type QueryParams = object;

export interface ApiClientConfig {
  baseUrl: string;
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  getRefreshToken?: () => string | null | undefined | Promise<string | null | undefined>;
  onTokensRefreshed?: (tokens: { accessToken: string; refreshToken: string }) => void;
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
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export class ApiClient {
  private config: ApiClientConfig;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(config: ApiClientConfig) {
    this.config = config;
  }

  private get fetchImpl(): typeof fetch {
    if (this.config.fetchImpl) return this.config.fetchImpl;
    return (...args: Parameters<typeof fetch>) => fetch(...args);
  }

  private async authHeader(skipAuth?: boolean): Promise<Record<string, string>> {
    if (skipAuth) return {};
    const token = await this.config.getAccessToken?.();
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
        const refreshToken = await this.config.getRefreshToken?.();
        if (!refreshToken) return false;
        const res = await this.fetchImpl(`${this.config.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
        this.config.onTokensRefreshed?.(tokens);
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
