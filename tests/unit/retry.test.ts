import { describe, it, expect } from 'vitest';
import { getRetryDelay, shouldRetry } from '../../src/http/retry';

describe('shouldRetry', () => {
  it('returns true for 429 Too Many Requests', () => {
    expect(shouldRetry(429)).toBe(true);
  });

  it('returns true for 5xx errors', () => {
    expect(shouldRetry(500)).toBe(true);
    expect(shouldRetry(502)).toBe(true);
    expect(shouldRetry(503)).toBe(true);
  });

  it('returns false for 2xx and 4xx (non-429)', () => {
    expect(shouldRetry(200)).toBe(false);
    expect(shouldRetry(400)).toBe(false);
    expect(shouldRetry(401)).toBe(false);
    expect(shouldRetry(404)).toBe(false);
  });

  it('returns false when maxRetries is 0', () => {
    expect(shouldRetry(500, { maxRetries: 0 })).toBe(false);
  });
});

describe('getRetryDelay', () => {
  it('reads Retry-After header for 429', () => {
    const headers = new Headers();
    headers.set('Retry-After', '10');
    const mockResp = new Response(null, { headers }) as Response;
    expect(getRetryDelay(0, 429, mockResp)).toBe(10_000);
  });

  it('falls back to baseDelay for 429 without Retry-After', () => {
    const headers = new Headers();
    const mockResp = new Response(null, { headers }) as Response;
    expect(getRetryDelay(0, 429, mockResp, { baseDelayMs: 5000 })).toBe(5000);
  });

  it('uses exponential backoff for 5xx', () => {
    const headers = new Headers();
    const mockResp = new Response(null, { headers }) as Response;
    const delay = getRetryDelay(0, 500, mockResp, { baseDelayMs: 1000 });
    // Should be ~1000ms + jitter (0-1000ms)
    expect(delay).toBeGreaterThanOrEqual(1000);
    expect(delay).toBeLessThanOrEqual(2000);
  });

  it('caps delay at maxDelayMs', () => {
    const headers = new Headers();
    const mockResp = new Response(null, { headers }) as Response;
    const delay = getRetryDelay(5, 500, mockResp, {
      baseDelayMs: 1000,
      maxDelayMs: 5000,
    });
    expect(delay).toBeLessThanOrEqual(5000);
  });
});
