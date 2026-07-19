import type { Logger } from './logger.js';
import type { RetryOptions } from './retry.js';
import { getRetryDelay, shouldRetry } from './retry.js';
import { generateTraceId } from './logger.js';
import { maskSecrets, truncateLogBody } from './logging-utils.js';
import { ProxyAgent } from 'undici';

/**
 * Authentication provider interface.
 * Each portal (CSDL Dược, QĐ 228) implements this to inject its own auth headers.
 */
export interface AuthProvider {
  /** Return headers to inject into every request */
  getAuthHeaders(traceId?: string): Promise<Record<string, string>>;
  /** Called after receiving a 401 — may clear cached token. Returns true if retry allowed. */
  onUnauthorized(traceId?: string): Promise<boolean>;
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
  /** Optional proxy server URL */
  proxyUrl?: string;
}

interface RequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  queryParams?: Record<string, string | number | undefined>;
  contentType?: 'json' | 'form';
  traceId?: string;
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
  private readonly proxyAgent?: ProxyAgent;
  private auth?: AuthProvider;

  constructor(opts: HttpClientOptions, auth?: AuthProvider) {
    this.baseUrl = opts.baseUrl;
    this.logger = opts.logger;
    this.retryOpts = opts.retry;
    this.defaultHeaders = opts.defaultHeaders ?? {};
    this.auth = auth;
    this.proxyAgent = opts.proxyUrl ? new ProxyAgent(opts.proxyUrl) : undefined;
  }

  setAuth(auth: AuthProvider): void {
    this.auth = auth;
  }

  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    // Tạo mã ngẫu nhiên cho mỗi request để dễ dàng trace theo dõi log từ lúc gửi đến lúc nhận (Traceability).
    // Nếu có traceId truyền vào từ bên ngoài (ví dụ trong polling hoặc từ app cha), ta ưu tiên dùng traceId đó.
    const traceId = init.traceId ?? generateTraceId();
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
      // Trước khi gửi, gọi AuthProvider để lấy Bearer Token nhét vào Header.
      // Nếu token chưa có/hết hạn, quá trình này sẽ tự động chặn lại để đi Login lấy Token.
      ...(this.auth ? await this.auth.getAuthHeaders(traceId) : {}),
    };

    const timeoutMs = this.retryOpts?.timeoutMs ?? 30_000;
    const maxRetries = this.retryOpts?.maxRetries ?? 3;

    this.logRequest(method, url, traceId, init.body);

    let retriesUsed = 0;
    let did401Retry = false;

    // Vòng lặp Retry. Nếu gọi bị lỗi Server (500, 429) hoặc đứt mạng, sẽ thử lại tối đa maxRetries lần.
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const resp = await fetch(url, {
          method,
          headers,
          body: bodyStr,
          signal: controller.signal,
          ...(this.proxyAgent ? { dispatcher: this.proxyAgent } : {}),
        } as any);
        clearTimeout(timer);

        // 401 → re-auth once, then retry
        if (resp.status === 401 && !did401Retry && this.auth) {
          // CƠ CHẾ AUTO-RECOVERY: Đôi khi Token chưa hết hạn trên RAM nhưng Server Cục Dược đã xóa (Invalidate).
          // SDK sẽ bắt lỗi 401, đánh dấu cờ did401Retry để không bị lặp vô hạn.
          did401Retry = true;
          this.logger.warn(`[${traceId}] 401 Unauthorized — refreshing auth and retrying`, {
            traceId,
          });
          // Gọi hàm này để xóa token cũ, ép Login lại lấy token mới toanh.
          const refreshed = await this.auth.onUnauthorized(traceId);
          if (refreshed) {
            // Lấy token mới đè vào Header cũ, dùng "continue" lặp lại vòng lặp để gửi lại đúng Request cũ.
            // Developer bên ngoài sẽ KHÔNG hề biết là vừa có lỗi 401 xảy ra.
            Object.assign(headers, await this.auth.getAuthHeaders(traceId));
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
          // Nếu rớt vào 500 (Server Cục Dược sập) hoặc 429 (Bị chặn do gọi quá nhanh).
          // Tính toán thời gian ngủ (delay) rồi mới thử lại để giảm tải cho Server.
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
          // Đứt mạng giữa chừng hoặc quá 30s không nhận được phản hồi (Timeout), cũng sẽ tính toán thời gian delay để thử lại.
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
      traceId?: string;
    },
  ): Promise<T> {
    return this.request<T>(path, { method: 'GET', ...opts });
  }

  async post<T = unknown>(
    path: string,
    body: unknown,
    opts?: {
      headers?: Record<string, string>;
      contentType?: 'json' | 'form';
      traceId?: string;
    },
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
