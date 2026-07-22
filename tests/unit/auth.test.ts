import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import '../helpers/mock-handlers';
import { resetLoginCounter, getLoginCallCount, server } from '../helpers/mock-handlers';
import { CsdlDuocAuth } from '../../src/auth/csdl-duoc-auth';
import { StructuredLogger } from '../../src/http/logger';
import { DrugPortalClient } from '../../src/index';

describe('CsdlDuocAuth', () => {
  beforeEach(() => {
    resetLoginCounter();
  });

  it('deduplicates concurrent login requests using a promise lock', async () => {
    const logger = new StructuredLogger('Test');
    const auth = new CsdlDuocAuth({
      config: { username: 'test', password: 'test' },
      baseUrl: 'https://api-sandbox.csdlduoc.com.vn/v2',
      logger,
    });

    // Fire 5 concurrent getAuthHeaders calls
    const results = await Promise.all([
      auth.getAuthHeaders(),
      auth.getAuthHeaders(),
      auth.getAuthHeaders(),
      auth.getAuthHeaders(),
      auth.getAuthHeaders(),
    ]);

    // Verify all returned the correct auth header
    for (const res of results) {
      expect(res.Authorization).toBe('Bearer test-access-token-12345');
    }

    // Verify only ONE HTTP call was sent to CSDL Dược login endpoint
    expect(getLoginCallCount()).toBe(1);
  });

  it('isolates user errors in onTokenChange callback', async () => {
    const logger = new StructuredLogger('Test');
    const customOnTokenChange = vi.fn().mockImplementation(() => {
      throw new Error('Database connection failed');
    });

    const auth = new CsdlDuocAuth({
      config: { username: 'test', password: 'test' },
      baseUrl: 'https://api-sandbox.csdlduoc.com.vn/v2',
      logger,
      onTokenChange: customOnTokenChange,
    });

    // This should resolve successfully without throwing
    const res = await auth.getAuthHeaders();
    expect(res.Authorization).toBe('Bearer test-access-token-12345');
    expect(customOnTokenChange).toHaveBeenCalled();
  });

  it('uses setCachedToken and skips login while token is valid', async () => {
    const logger = new StructuredLogger('Test');
    const auth = new CsdlDuocAuth({
      config: { username: 'test', password: 'test' },
      baseUrl: 'https://api-sandbox.csdlduoc.com.vn/v2',
      logger,
    });

    const expiresAt = new Date(Date.now() + 3600_000);
    auth.setCachedToken('cached-token', expiresAt);

    const headers = await auth.getAuthHeaders();
    expect(headers.Authorization).toBe('Bearer cached-token');
    expect(getLoginCallCount()).toBe(0);
    expect(auth.getState()?.accessToken).toBe('cached-token');
  });

  it('rejects login with invalid credentials', async () => {
    const logger = new StructuredLogger('Test', {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });
    const auth = new CsdlDuocAuth({
      config: { username: 'wrong', password: 'wrong' },
      baseUrl: 'https://api-sandbox.csdlduoc.com.vn/v2',
      logger,
    });

    await expect(auth.getAuthHeaders()).rejects.toThrow(/login failed/);
  });

  it('onUnauthorized re-logins and returns true', async () => {
    const logger = new StructuredLogger('Test');
    const auth = new CsdlDuocAuth({
      config: { username: 'test', password: 'test' },
      baseUrl: 'https://api-sandbox.csdlduoc.com.vn/v2',
      logger,
    });

    auth.setCachedToken('stale', new Date(Date.now() + 3600_000));
    const ok = await auth.onUnauthorized('t-1');
    expect(ok).toBe(true);
    expect(auth.getState()?.accessToken).toBe('test-access-token-12345');
  });

  it('onUnauthorized returns false when re-login fails', async () => {
    server.use(
      http.post('*/auth/login', () => new HttpResponse('down', { status: 500 })),
    );
    const logger = new StructuredLogger('Test', {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    });
    const auth = new CsdlDuocAuth({
      config: { username: 'test', password: 'test' },
      baseUrl: 'https://api-sandbox.csdlduoc.com.vn/v2',
      logger,
    });

    expect(await auth.onUnauthorized()).toBe(false);
  });

  it('DrugPortalClient restores cachedToken from config', async () => {
    const onTokenChange = vi.fn();
    const client = new DrugPortalClient({
      environment: 'sandbox',
      csdlDuoc: { username: 'test', password: 'test' },
      cachedToken: 'from-db',
      cachedTokenExpiresAt: new Date(Date.now() + 3600_000),
      onTokenChange,
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    // Trigger a request; should not need login because cached token is valid
    resetLoginCounter();
    const result = await client.csdlDuoc.drugs.search('para', { source: 'pos' });
    expect(result.items.length).toBeGreaterThan(0);
    expect(getLoginCallCount()).toBe(0);
  });
});
