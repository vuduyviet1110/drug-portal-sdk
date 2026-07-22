import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProxyManager,
  clearFallbackProxyCache,
} from '../../src/http/proxy-resolver';

describe('ProxyManager', () => {
  beforeEach(() => {
    clearFallbackProxyCache();
  });

  afterEach(() => {
    clearFallbackProxyCache();
  });

  it('creates an HTTP proxy agent when proxyUrl is set', async () => {
    const manager = new ProxyManager({
      proxyUrl: 'http://127.0.0.1:8080',
      targetBaseUrl: 'https://api-sandbox.csdlduoc.com.vn/v2',
    });
    expect(await manager.getDispatcher()).toBeDefined();
  });

  it('creates a SOCKS5 proxy agent for socks URLs', async () => {
    const manager = new ProxyManager({
      proxyUrl: 'socks5://127.0.0.1:1080',
      targetBaseUrl: 'https://api-sandbox.csdlduoc.com.vn/v2',
    });
    expect(await manager.getDispatcher()).toBeDefined();
  });

  it('returns undefined when auto fallback is disabled', async () => {
    const manager = new ProxyManager({
      targetBaseUrl: 'https://api-sandbox.csdlduoc.com.vn/v2',
    });
    expect(await manager.getDispatcher()).toBeUndefined();
  });

  it('clearResolved resets cached agent', async () => {
    const manager = new ProxyManager({
      proxyUrl: 'http://127.0.0.1:9999',
      targetBaseUrl: 'https://api-sandbox.csdlduoc.com.vn/v2',
    });
    expect(await manager.getDispatcher()).toBeDefined();
    manager.clearResolved();
    expect(await manager.getDispatcher()).toBeUndefined();
  });

  it('clearFallbackProxyCache is exported and callable', () => {
    expect(() => clearFallbackProxyCache()).not.toThrow();
  });

  it('accepts autoFallback and progress callbacks in constructor', () => {
    const onProgress = vi.fn();
    const onProxyResolved = vi.fn();
    const manager = new ProxyManager({
      autoFallback: true,
      targetBaseUrl: 'https://api-sandbox.csdlduoc.com.vn/v2',
      onProgress,
      onProxyResolved,
    });
    expect(manager).toBeDefined();
  });
});
