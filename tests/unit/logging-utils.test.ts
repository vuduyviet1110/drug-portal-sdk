import { describe, it, expect } from 'vitest';
import { maskSecrets, truncateLogBody } from '../../src/http/logging-utils';

describe('maskSecrets', () => {
  it('masks password field in object', () => {
    const input = { username: 'test', password: 'secret123' };
    const result = maskSecrets(input);
    expect(result).toEqual({ username: 'test', password: '***' });
  });

  it('masks access_token field', () => {
    const input = { access_token: 'abc-123', data: 'value' };
    const result = maskSecrets(input);
    expect(result).toEqual({ access_token: '***', data: 'value' });
  });

  it('masks app-key field (case-insensitive)', () => {
    const input = { 'app-key': 'sk-xxx', 'app-name': 'test' };
    const result = maskSecrets(input);
    expect(result).toEqual({ 'app-key': '***', 'app-name': 'test' });
  });

  it('masks nested objects', () => {
    const input = { user: { token: 'secret', name: 'Test' } };
    const result = maskSecrets(input);
    expect(result).toEqual({ user: { token: '***', name: 'Test' } });
  });

  it('returns primitives unchanged', () => {
    expect(maskSecrets('hello')).toBe('hello');
    expect(maskSecrets(42)).toBe(42);
    expect(maskSecrets(true)).toBe(true);
    expect(maskSecrets(null)).toBe(null);
    expect(maskSecrets(undefined)).toBe(undefined);
  });

  it('maps arrays through masking', () => {
    const input = [{ password: '1' }, { password: '2' }];
    const result = maskSecrets(input);
    expect(result).toEqual([{ password: '***' }, { password: '***' }]);
  });
});

describe('truncateLogBody', () => {
  it('returns short body unchanged', () => {
    const body = 'hello world';
    expect(truncateLogBody(body)).toBe(body);
  });

  it('truncates long body with indicator', () => {
    const body = 'x'.repeat(20_000);
    const result = truncateLogBody(body);
    expect(result.length).toBeLessThan(body.length);
    expect(result).toContain('[truncated, total 20000 chars]');
  });

  it('respects max length boundary', () => {
    const body = 'x'.repeat(10_001);
    const result = truncateLogBody(body);
    // API_LOG_BODY_MAX=10000 + '... [truncated, total 10001 chars]'.length = 10000+34 = 10034
    expect(result.length).toBe(10_000 + '... [truncated, total 10001 chars]'.length);
  });
});
