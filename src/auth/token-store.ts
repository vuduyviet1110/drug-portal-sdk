import type { AuthState } from '../types/auth.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Interface for token persistence.
 * Implement this interface to store CSDL Dược authentication tokens in Redis, database, etc.
 */
export interface TokenStore {
  /** Retrieve a token from the store */
  get(key: string): Promise<AuthState | null>;
  /** Save a token to the store */
  set(key: string, state: AuthState): Promise<void>;
  /** Clear a token from the store */
  clear(key: string): Promise<void>;
}

/**
 * In-Memory token storage.
 * Useful for development and testing.
 */
export class MemoryTokenStore implements TokenStore {
  private cache = new Map<string, string>();

  async get(key: string): Promise<AuthState | null> {
    const raw = this.cache.get(key);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return {
        accessToken: data.accessToken,
        expiresAt: new Date(data.expiresAt),
      };
    } catch {
      return null;
    }
  }

  async set(key: string, state: AuthState): Promise<void> {
    this.cache.set(key, JSON.stringify(state));
  }

  async clear(key: string): Promise<void> {
    this.cache.delete(key);
  }
}

/**
 * File-system token storage.
 * Automatically saves token to a JSON file on disk.
 */
export class FileTokenStore implements TokenStore {
  private filePath: string;

  constructor(filePath = '.token_cache.json') {
    this.filePath = path.resolve(filePath);
  }

  private async readCache(): Promise<Record<string, string>> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private async writeCache(cache: Record<string, string>): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(cache, null, 2), 'utf-8');
    } catch {
      // Ignore write errors to prevent breaking runtime
    }
  }

  async get(key: string): Promise<AuthState | null> {
    const cache = await this.readCache();
    const raw = cache[key];
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return {
        accessToken: data.accessToken,
        expiresAt: new Date(data.expiresAt),
      };
    } catch {
      return null;
    }
  }

  async set(key: string, state: AuthState): Promise<void> {
    const cache = await this.readCache();
    cache[key] = JSON.stringify(state);
    await this.writeCache(cache);
  }

  async clear(key: string): Promise<void> {
    const cache = await this.readCache();
    delete cache[key];
    await this.writeCache(cache);
  }
}

/**
 * Generic Redis Token Store compatible with standard redis/ioredis client signatures.
 */
export interface GenericRedisClient {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string, mode?: string, duration?: number): Promise<unknown> | unknown;
  del(key: string): Promise<unknown> | unknown;
}

export class RedisTokenStore implements TokenStore {
  private client: GenericRedisClient;
  private prefix: string;

  constructor(client: GenericRedisClient, prefix = 'drug_portal_token:') {
    this.client = client;
    this.prefix = prefix;
  }

  async get(key: string): Promise<AuthState | null> {
    const raw = await this.client.get(`${this.prefix}${key}`);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return {
        accessToken: data.accessToken,
        expiresAt: new Date(data.expiresAt),
      };
    } catch {
      return null;
    }
  }

  async set(key: string, state: AuthState): Promise<void> {
    const redisKey = `${this.prefix}${key}`;
    const value = JSON.stringify(state);
    const ttlSeconds = Math.max(0, Math.floor((state.expiresAt.getTime() - Date.now()) / 1000));
    
    if (ttlSeconds > 0) {
      await this.client.set(redisKey, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(redisKey, value);
    }
  }

  async clear(key: string): Promise<void> {
    await this.client.del(`${this.prefix}${key}`);
  }
}
