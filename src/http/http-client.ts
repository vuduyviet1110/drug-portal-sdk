import type { Logger } from './logger.js';
import type { RetryOptions } from './retry.js';
import { getRetryDelay, shouldRetry } from './retry.js';
import { generateTraceId } from './logger.js';
import { maskSecrets, truncateLogBody } from './logging-utils.js';

/**
 * Authentication provider interface.
 * Each portal (CSDL Dược, QĐ 228) implements this to inject its own auth headers.
 */
export interface AuthProvider {
  /** Return headers to inject into every request */
  getAuthHeaders(): Promise<Record<string, string>>;
  /** Called after receiving a 401 — may clear cached token. Returns true if retry allowed. */
  onUnauthorized(): Promise<boolean>;
}

/** SDK-wide error type */
export class DrugPortalError extends Error {
  readonly status?: number;
  readonly traceId: string;
  readonly responseBody?: string;
  readonly data?: unknown;

  constructor(
    message: string,
    opts: {
      status?: number;
      traceId: string;
      responseBody?: string;
      data?: unknown;
    },
  ) {
    super(message);
    this.name = 'DrugPortalError';
    this.status = opts.status;
    this.traceId = opts.traceId;
    this.responseBody = opts.responseBody;
    this.data = opts.data;
  }
}

export interface HttpClientOptions {
  baseUrl: string;
  logger: Logger;
  retry?: RetryOptions;
  /** Static headers injected on every request (e.g. app-name/app-key) */
  defaultHeaders?: Record<string, string>;
}

interface RequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  queryParams?: Record<string, string | number | undefined>;
  contentType?: 'json' | 'form';
}

/**
 * Core HTTP client with retry/backoff, structured logging, and trace ID.
 * Ported from Python `_http()` / `_request()` in csdlduoc_service.py.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly logger: Logger;
  private readonly retryOpts?: RetryOptions;
  private readonly defaultHeaders: Record<string, string>;
  private auth?: AuthProvider;

  constructor(opts: HttpClientOptions, auth?: AuthProvider) {
    this.baseUrl = opts.baseUrl;
    this.logger = opts.logger;
    this.retryOpts = opts.retry;
    this.defaultHeaders = opts.defaultHeaders ?? {};
    this.auth = auth;
  }

  setAuth(auth: AuthProvider): void {
    this.auth = auth;
  }

  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const traceId = generateTraceId();
    const url = this.buildUrl(path, init.queryParams);
    const method = init.method ?? 'GET';
    const contentType = init.contentType ?? 'json';

    let bodyStr: string | undefined;
    let contentHeader: Record<string, string> = {};
    if (init.body !== undefined) {
      if (contentType === 'form') {
        bodyStr = new URLSearchParams(init.body as Record<string, string>).toString();
        contentHeader = { 'Content-Type': 'application/x-www-form-urlencoded' };
      } else {
        bodyStr = JSON.stringify(init.body);
        contentHeader = { 'Content-Type': 'application/json' };
      }
    }

    const headers: Record<string, string> = {
      ...contentHeader,
      ...this.defaultHeaders,
      ...(init.headers ?? {}),
      ...(this.auth ? await this.auth.getAuthHeaders() : {}),
    };

    const timeoutMs = this.retryOpts?.timeoutMs ?? 30_000;
    const maxRetries = this.retryOpts?.maxRetries ?? 3;

    this.logRequest(method, url, traceId, init.body);

    let retriesUsed = 0;
    let did401Retry = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const resp = await fetch(url, {
          method,
          headers,
          body: bodyStr,
          signal: controller.signal,
        });
        clearTimeout(timer);

        // 401 → re-auth once, then retry
        if (resp.status === 401 && !did401Retry && this.auth) {
          did401Retry = true;
          this.logger.warn(`[${traceId}] 401 Unauthorized — refreshing auth and retrying`);
          const refreshed = await this.auth.onUnauthorized();
          if (refreshed) {
            Object.assign(headers, await this.auth.getAuthHeaders());
            // Re-issue same request with fresh headers — don't count as attempt
            continue;
          }
          throw new DrugPortalError('Authentication failed after 401', {
            status: 401,
            traceId,
            responseBody: await resp.text(),
          });
        }

        // 429 / 5xx → retry
        if (shouldRetry(resp.status, this.retryOpts) && attempt < maxRetries) {
          const delay = getRetryDelay(attempt, resp.status, resp, this.retryOpts);
          this.logger.warn(
            `[${traceId}] HTTP ${resp.status} — retry ${attempt + 1}/${maxRetries} in ${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
          retriesUsed = attempt + 1;
          continue;
        }

        const text = await resp.text();
        this.logResponse(method, url, resp.status, traceId, text, retriesUsed);

        if (!resp.ok) {
          throw new DrugPortalError(`HTTP ${resp.status}: ${text.slice(0, 200)}`, {
            status: resp.status,
            traceId,
            responseBody: text,
          });
        }

        if (!text) return {} as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          return text as T;
        }
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof DrugPortalError) throw err;

        const isAbort = err instanceof Error && err.name === 'AbortError';
        const isTransient =
          err instanceof TypeError || // network errors in Node fetch
          isAbort;

        if (isTransient && attempt < maxRetries) {
          const delay = getRetryDelay(attempt, 0, undefined, this.retryOpts);
          this.logger.warn(
            `[${traceId}] ${isAbort ? 'Timeout' : 'Network error'} — retry ${attempt + 1}/${maxRetries} in ${delay}ms`,
          );
          await new Promise((r) => setTimeout(r, delay));
          retriesUsed = attempt + 1;
          continue;
        }

        throw new DrugPortalError(
          isAbort
            ? `Request timeout after ${timeoutMs}ms`
            : `Network error: ${(err as Error).message}`,
          { traceId },
        );
      }
    }

    throw new DrugPortalError('Max retries exceeded', { traceId });
  }

  // ─── Convenience methods ─────────────────────────────────────

  async get<T = unknown>(
    path: string,
    opts?: {
      headers?: Record<string, string>;
      queryParams?: Record<string, string | number | undefined>;
    },
  ): Promise<T> {
    return this.request<T>(path, { method: 'GET', ...opts });
  }

  async post<T = unknown>(
    path: string,
    body: unknown,
    opts?: { headers?: Record<string, string>; contentType?: 'json' | 'form' },
  ): Promise<T> {
    return this.request<T>(path, { method: 'POST', body, ...opts });
  }

  // ─── Internals ───────────────────────────────────────────────

  private buildUrl(
    path: string,
    queryParams?: Record<string, string | number | undefined>,
  ): string {
    const base = this.baseUrl.replace(/\/+$/, '');
    const cleanPath = path.replace(/^\/+/, '');
    const url = new URL(`${base}/${cleanPath}`);
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private logRequest(method: string, url: string, traceId: string, body: unknown): void {
    this.logger.debug(`→ ${method} ${url}`, {
      traceId,
      body: body ? maskSecrets(body) : undefined,
    });
  }

  private logResponse(
    method: string,
    url: string,
    status: number,
    traceId: string,
    body: string,
    retries: number,
  ): void {
    const level = status >= 400 ? 'warn' : 'debug';
    this.logger[level](`← ${status} ${method} ${url}`, {
      traceId,
      retries,
      body: truncateLogBody(body),
    });
  }
}
