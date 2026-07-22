import { describe, it, expect, vi } from 'vitest';
import { Qd228Auth } from '../../src/auth/qd228-auth';
import { StructuredLogger } from '../../src/http/logger';

describe('Qd228Auth', () => {
  it('returns static app-name and app-key headers', async () => {
    const auth = new Qd228Auth(
      { appName: 'my-app', appKey: 'my-key' },
      new StructuredLogger('Test'),
    );

    const headers = await auth.getAuthHeaders();
    expect(headers).toEqual({
      'app-name': 'my-app',
      'app-key': 'my-key',
    });
  });

  it('does not allow retry on unauthorized', async () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const auth = new Qd228Auth({ appName: 'a', appKey: 'b' }, logger);

    const allowed = await auth.onUnauthorized('trace-1');
    expect(allowed).toBe(false);
    expect(logger.error).toHaveBeenCalled();
    expect(logger.error.mock.calls[0]?.[1]?.traceId).toBe('trace-1');
  });
});
