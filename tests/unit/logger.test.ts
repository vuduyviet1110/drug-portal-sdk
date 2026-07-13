import { describe, it, expect, vi } from 'vitest';
import { generateTraceId, StructuredLogger } from '../../src/http/logger';

describe('generateTraceId', () => {
  it('returns a string', () => {
    const id = generateTraceId();
    expect(typeof id).toBe('string');
  });

  it('returns unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateTraceId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('StructuredLogger', () => {
  it('delegates to custom logger and does not write to console.log', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const customLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const logger = new StructuredLogger('TestPrefix', customLogger);
    logger.info('hello', { foo: 'bar' });

    expect(customLogger.info).toHaveBeenCalledWith('hello', { foo: 'bar' });
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('writes JSON to console.log if no custom logger is provided', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new StructuredLogger('TestPrefix');
    logger.info('hello', { foo: 'bar' });

    expect(consoleSpy).toHaveBeenCalled();
    const logVal = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logVal.message).toBe('hello');
    expect(logVal.source).toBe('TestPrefix');
    expect(logVal.level).toBe('INFO');
    expect(logVal.foo).toBe('bar');

    consoleSpy.mockRestore();
  });
});
