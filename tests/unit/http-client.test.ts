import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import '../helpers/mock-handlers';
import { server } from '../helpers/mock-handlers';
import { HttpClient, DrugPortalError } from '../../src/http/http-client';
import type { AuthProvider } from '../../src/http/http-client';
import { StructuredLogger } from '../../src/http/logger';

function createAuth(overrides: Partial<AuthProvider> = {}): AuthProvider {
  return {
    getAuthHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer tok' }),
    onUnauthorized: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('DrugPortalError', () => {
  it('stores status, traceId, and response body', () => {
    const err = new DrugPortalError('boom', {
      status: 500,
      traceId: 't-1',
      responseBody: 'fail',
      data: { code: 1 },
    });
    expect(err.name).toBe('DrugPortalError');
    expect(err.status).toBe(500);
    expect(err.traceId).toBe('t-1');
    expect(err.responseBody).toBe('fail');
    expect(err.data).toEqual({ code: 1 });
  });
});

describe('HttpClient', () => {
  const baseUrl = 'https://api-sandbox.csdlduoc.com.vn/v2';
  const logger = new StructuredLogger('HttpTest', {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  });

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it('performs GET and parses JSON', async () => {
    server.use(
      http.get('*/custom-endpoint', () => HttpResponse.json({ ok: true, value: 1 })),
    );
    const client = new HttpClient({ baseUrl, logger, retry: { maxRetries: 0 } });
    const data = await client.get<{ ok: boolean; value: number }>('/custom-endpoint');
    expect(data).toEqual({ ok: true, value: 1 });
  });

  it('posts form-urlencoded bodies', async () => {
    let receivedContentType = '';
    let receivedBody = '';
    server.use(
      http.post('*/form-post', async ({ request }) => {
        receivedContentType = request.headers.get('content-type') ?? '';
        receivedBody = await request.text();
        return HttpResponse.json({ ok: true });
      }),
    );

    const client = new HttpClient({ baseUrl, logger, retry: { maxRetries: 0 } });
    await client.post('/form-post', { a: '1', b: '2' }, { contentType: 'form' });

    expect(receivedContentType).toContain('application/x-www-form-urlencoded');
    expect(receivedBody).toBe('a=1&b=2');
  });

  it('injects auth headers from AuthProvider', async () => {
    let authHeader = '';
    server.use(
      http.get('*/secure', ({ request }) => {
        authHeader = request.headers.get('authorization') ?? '';
        return HttpResponse.json({});
      }),
    );

    const auth = createAuth();
    const client = new HttpClient({ baseUrl, logger, retry: { maxRetries: 0 } }, auth);
    await client.get('/secure');
    expect(authHeader).toBe('Bearer tok');
    expect(auth.getAuthHeaders).toHaveBeenCalled();
  });

  it('retries once after 401 when onUnauthorized succeeds', async () => {
    let hits = 0;
    server.use(
      http.get('*/secure-401', () => {
        hits++;
        if (hits === 1) {
          return new HttpResponse('unauthorized', { status: 401 });
        }
        return HttpResponse.json({ recovered: true });
      }),
    );

    const auth = createAuth();
    // maxRetries must be >= 1: 401 re-auth uses `continue`, which advances the attempt counter
    const client = new HttpClient(
      { baseUrl, logger, retry: { maxRetries: 1, baseDelayMs: 1 } },
      auth,
    );
    const data = await client.get<{ recovered: boolean }>('/secure-401');
    expect(data.recovered).toBe(true);
    expect(auth.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(hits).toBe(2);
  });

  it('throws DrugPortalError when 401 refresh fails', async () => {
    server.use(http.get('*/secure-401-fail', () => new HttpResponse('nope', { status: 401 })));
    const auth = createAuth({ onUnauthorized: vi.fn().mockResolvedValue(false) });
    const client = new HttpClient({ baseUrl, logger, retry: { maxRetries: 0 } }, auth);

    await expect(client.get('/secure-401-fail')).rejects.toMatchObject({
      name: 'DrugPortalError',
      status: 401,
    });
  });

  it('retries on 503 then succeeds', async () => {
    vi.useFakeTimers();
    let hits = 0;
    server.use(
      http.get('*/flaky', () => {
        hits++;
        if (hits === 1) return new HttpResponse('down', { status: 503 });
        return HttpResponse.json({ ok: true });
      }),
    );

    const client = new HttpClient({
      baseUrl,
      logger,
      retry: { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 20 },
    });

    const promise = client.get<{ ok: boolean }>('/flaky');
    await vi.runAllTimersAsync();
    const data = await promise;
    expect(data.ok).toBe(true);
    expect(hits).toBe(2);
    vi.useRealTimers();
  });

  it('throws on non-retryable 4xx', async () => {
    server.use(http.get('*/missing', () => new HttpResponse('gone', { status: 404 })));
    const client = new HttpClient({ baseUrl, logger, retry: { maxRetries: 0 } });
    await expect(client.get('/missing')).rejects.toBeInstanceOf(DrugPortalError);
  });

  it('appends query params and ignores undefined values', async () => {
    let url = '';
    server.use(
      http.get('*/query', ({ request }) => {
        url = request.url;
        return HttpResponse.json({});
      }),
    );
    const client = new HttpClient({ baseUrl, logger, retry: { maxRetries: 0 } });
    await client.get('/query', {
      queryParams: { page: 1, search: 'para', skip: undefined },
    });
    expect(url).toContain('page=1');
    expect(url).toContain('search=para');
    expect(url).not.toContain('skip=');
  });

  it('returns empty object for empty response body', async () => {
    server.use(http.get('*/empty', () => new HttpResponse('', { status: 200 })));
    const client = new HttpClient({ baseUrl, logger, retry: { maxRetries: 0 } });
    const data = await client.get('/empty');
    expect(data).toEqual({});
  });

  it('allows setAuth after construction', async () => {
    let authHeader = '';
    server.use(
      http.get('*/later-auth', ({ request }) => {
        authHeader = request.headers.get('authorization') ?? '';
        return HttpResponse.json({});
      }),
    );
    const client = new HttpClient({ baseUrl, logger, retry: { maxRetries: 0 } });
    client.setAuth(createAuth());
    await client.get('/later-auth');
    expect(authHeader).toBe('Bearer tok');
  });
});
