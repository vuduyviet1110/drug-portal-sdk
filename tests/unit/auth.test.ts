import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../helpers/mock-handlers';
import { resetLoginCounter, getLoginCallCount } from '../helpers/mock-handlers';
import { CsdlDuocAuth } from '../../src/auth/csdl-duoc-auth';
import { StructuredLogger } from '../../src/http/logger';

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
});
