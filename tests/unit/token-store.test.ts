import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  MemoryTokenStore,
  FileTokenStore,
  RedisTokenStore,
  type GenericRedisClient,
} from '../../src/auth/token-store';

describe('MemoryTokenStore', () => {
  it('returns null for missing keys', async () => {
    const store = new MemoryTokenStore();
    expect(await store.get('missing')).toBeNull();
  });

  it('round-trips token state', async () => {
    const store = new MemoryTokenStore();
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');
    await store.set('user-a', { accessToken: 'tok-1', expiresAt });

    const state = await store.get('user-a');
    expect(state?.accessToken).toBe('tok-1');
    expect(state?.expiresAt.toISOString()).toBe(expiresAt.toISOString());
  });

  it('clears a key', async () => {
    const store = new MemoryTokenStore();
    await store.set('user-a', { accessToken: 'tok', expiresAt: new Date() });
    await store.clear('user-a');
    expect(await store.get('user-a')).toBeNull();
  });

  it('returns null when cached JSON is corrupt', async () => {
    const store = new MemoryTokenStore();
    // Force corrupt entry via internal map
    (store as unknown as { cache: Map<string, string> }).cache.set('bad', '{not-json');
    expect(await store.get('bad')).toBeNull();
  });
});

describe('FileTokenStore', () => {
  let tmpFile: string;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drug-portal-token-'));
    tmpFile = path.join(tmpDir, 'cache.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('persists and reloads tokens from disk', async () => {
    const store = new FileTokenStore(tmpFile);
    const expiresAt = new Date('2030-06-15T12:00:00.000Z');
    await store.set('csdl', { accessToken: 'file-tok', expiresAt });

    const reloaded = new FileTokenStore(tmpFile);
    const state = await reloaded.get('csdl');
    expect(state?.accessToken).toBe('file-tok');
    expect(state?.expiresAt.toISOString()).toBe(expiresAt.toISOString());
  });

  it('returns null when file does not exist', async () => {
    const store = new FileTokenStore(path.join(tmpDir, 'missing-token-cache.json'));
    expect(await store.get('any')).toBeNull();
  });

  it('clears a key from the file cache', async () => {
    const store = new FileTokenStore(tmpFile);
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');
    await store.set('a', { accessToken: '1', expiresAt });
    await store.set('b', { accessToken: '2', expiresAt });
    await store.clear('a');

    expect(await store.get('a')).toBeNull();
    expect(await store.get('b')).toEqual({
      accessToken: '2',
      expiresAt,
    });
  });
});

describe('RedisTokenStore', () => {
  function createFakeRedis() {
    const data = new Map<string, string>();
    const client: GenericRedisClient = {
      get: (key) => data.get(key) ?? null,
      set: (key, value) => {
        data.set(key, value);
        return 'OK';
      },
      del: (key) => {
        data.delete(key);
        return 1;
      },
    };
    return { client, data };
  }

  it('uses prefix and stores JSON with EX when TTL > 0', async () => {
    const { client, data } = createFakeRedis();
    const setSpyCalls: unknown[][] = [];
    const originalSet = client.set;
    client.set = (...args: Parameters<GenericRedisClient['set']>) => {
      setSpyCalls.push(args);
      return originalSet(...args);
    };

    const store = new RedisTokenStore(client, 'prefix:');
    const expiresAt = new Date(Date.now() + 3600_000);
    await store.set('user', { accessToken: 'redis-tok', expiresAt });

    expect(setSpyCalls[0]?.[0]).toBe('prefix:user');
    expect(setSpyCalls[0]?.[2]).toBe('EX');
    expect(typeof setSpyCalls[0]?.[3]).toBe('number');
    expect((setSpyCalls[0]?.[3] as number) > 0).toBe(true);

    const state = await store.get('user');
    expect(state?.accessToken).toBe('redis-tok');
    expect(data.has('prefix:user')).toBe(true);
  });

  it('sets without EX when token already expired', async () => {
    const { client } = createFakeRedis();
    const setSpyCalls: unknown[][] = [];
    const originalSet = client.set;
    client.set = (...args: Parameters<GenericRedisClient['set']>) => {
      setSpyCalls.push(args);
      return originalSet(...args);
    };

    const store = new RedisTokenStore(client);
    await store.set('user', {
      accessToken: 'expired',
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(setSpyCalls[0]).toHaveLength(2);
  });

  it('returns null for missing or corrupt values', async () => {
    const { client, data } = createFakeRedis();
    const store = new RedisTokenStore(client);
    expect(await store.get('missing')).toBeNull();

    data.set('drug_portal_token:bad', 'not-json');
    expect(await store.get('bad')).toBeNull();
  });

  it('clears keys via del', async () => {
    const { client, data } = createFakeRedis();
    const store = new RedisTokenStore(client);
    await store.set('user', { accessToken: 'x', expiresAt: new Date(Date.now() + 60_000) });
    await store.clear('user');
    expect(data.has('drug_portal_token:user')).toBe(false);
  });
});
