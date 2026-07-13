import { describe, it, expect } from 'vitest';
import { generateTraceId } from '../../src/http/logger';

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
