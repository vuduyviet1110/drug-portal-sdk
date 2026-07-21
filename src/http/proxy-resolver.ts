import { ProxyAgent, Socks5ProxyAgent, fetch } from 'undici';

let cachedFallbackProxy: string | null = null;
let isScraping = false;

/**
 * Checks if the target base URL can be reached directly without proxy.
 */
export async function checkDirectConnection(baseUrl: string): Promise<boolean> {
  try {
    const targetUrl = new URL(baseUrl).origin;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2000);

    await fetch(targetUrl, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(id);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Verifies if a proxy is alive and can reach the target base URL.
 */
export async function testProxy(baseUrl: string, proxyUrl: string): Promise<boolean> {
  try {
    const targetUrl = new URL(baseUrl).origin;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);

    const isSocks =
      proxyUrl.startsWith('socks://') ||
      proxyUrl.startsWith('socks5://') ||
      proxyUrl.startsWith('socks4://');

    const agent = isSocks ? new Socks5ProxyAgent(proxyUrl) : new ProxyAgent(proxyUrl);

    await fetch(targetUrl, {
      method: 'HEAD',
      signal: controller.signal,
      dispatcher: agent,
    } as any);

    clearTimeout(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scrapes and finds a working proxy in Vietnam.
 */
export async function getAutomaticFallbackProxy(
  baseUrl: string,
  onProgress?: (step: string, message: string) => void,
): Promise<string | null> {
  if (cachedFallbackProxy) {
    onProgress?.(
      'testing_cached_proxy',
      `Đang kiểm tra lại proxy lưu trong cache: ${cachedFallbackProxy}...`,
    );
    const works = await testProxy(baseUrl, cachedFallbackProxy);
    if (works) {
      onProgress?.(
        'reusing_cached_proxy',
        `Đang sử dụng lại proxy hoạt động tốt từ cache: ${cachedFallbackProxy}`,
      );
      return cachedFallbackProxy;
    }
    cachedFallbackProxy = null;
  }

  if (isScraping) return null;
  isScraping = true;

  try {
    onProgress?.('scraping_proxies', 'Đang quét danh sách proxy Việt Nam từ Geonode API...');
    const res = await fetch(
      'https://proxylist.geonode.com/api/proxy-list?limit=15&page=1&sort_by=lastChecked&sort_type=desc&country=VN&protocols=http%2Chttps%2Csocks5',
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = (await res.json()) as any;
    const proxies = (json.data || []) as { ip: string; port: string; protocols: string[] }[];

    onProgress?.(
      'testing_proxies',
      `Đã quét được ${proxies.length} proxy. Đang kiểm tra kết nối song song...`,
    );

    // Test in parallel to find first working one
    const testPromises = proxies.map(async (p) => {
      const isHttps = p.protocols.includes('https');
      const isHttp = p.protocols.includes('http');
      const protocol = isHttps || isHttp ? 'http' : 'socks5';
      const url = `${protocol}://${p.ip}:${p.port}`;
      const works = await testProxy(baseUrl, url);
      return works ? url : null;
    });

    const results = await Promise.all(testPromises);
    const workingProxy = results.find((url) => url !== null);

    if (workingProxy) {
      onProgress?.('proxy_found', `Đã tìm thấy proxy kết nối CSDL Dược ổn định: ${workingProxy}`);
      cachedFallbackProxy = workingProxy;
      return workingProxy;
    }

    onProgress?.(
      'proxy_not_found',
      'Không tìm thấy proxy Việt Nam nào hoạt động ổn định trong danh sách quét.',
    );
    return null;
  } catch (err: unknown) {
    onProgress?.('proxy_error', `Lỗi khi lấy proxy tự động: ${(err as Error).message}`);
    return null;
  } finally {
    isScraping = false;
  }
}

/**
 * Helper to clear the cached fallback proxy.
 */
export function clearFallbackProxyCache(): void {
  cachedFallbackProxy = null;
}

/**
 * Manage lazy proxy resolution and caching.
 */
export class ProxyManager {
  private proxyUrl?: string;
  private autoFallback?: boolean;
  private onProgress?: (step: string, message: string) => void;
  private targetBaseUrl: string;

  private resolvedProxyAgent?: ProxyAgent | Socks5ProxyAgent;
  private resolutionPromise?: Promise<ProxyAgent | Socks5ProxyAgent | undefined>;

  constructor(opts: {
    proxyUrl?: string;
    autoFallback?: boolean;
    onProgress?: (step: string, message: string) => void;
    targetBaseUrl: string;
  }) {
    this.proxyUrl = opts.proxyUrl;
    this.autoFallback = opts.autoFallback;
    this.onProgress = opts.onProgress;
    this.targetBaseUrl = opts.targetBaseUrl;

    if (this.proxyUrl && this.proxyUrl !== 'auto') {
      const isSocks =
        this.proxyUrl.startsWith('socks://') ||
        this.proxyUrl.startsWith('socks5://') ||
        this.proxyUrl.startsWith('socks4://');
      this.resolvedProxyAgent = isSocks
        ? new Socks5ProxyAgent(this.proxyUrl)
        : new ProxyAgent(this.proxyUrl);
    }
  }

  async getDispatcher(): Promise<ProxyAgent | Socks5ProxyAgent | undefined> {
    if (this.resolvedProxyAgent) {
      return this.resolvedProxyAgent;
    }
    // If auto is requested via proxyUrl="auto", treat it as autoFallback
    const shouldFallback = this.autoFallback || this.proxyUrl === 'auto';
    if (!shouldFallback) {
      return undefined;
    }

    if (!this.resolutionPromise) {
      this.resolutionPromise = (async () => {
        // Step 1: check direct connection
        this.onProgress?.(
          'check_direct_connection',
          'Đang kiểm tra kết nối trực tiếp đến máy chủ...',
        );
        const canConnect = await checkDirectConnection(this.targetBaseUrl);
        if (canConnect) {
          this.onProgress?.(
            'direct_connection_success',
            'Kết nối trực tiếp thành công! Không cần dùng proxy.',
          );
          return undefined;
        }

        // Step 2: fallback to auto proxy
        this.onProgress?.(
          'direct_connection_blocked',
          'Kết nối trực tiếp bị chặn. Kích hoạt tìm kiếm proxy Việt Nam...',
        );
        const fallbackUrl = await getAutomaticFallbackProxy(this.targetBaseUrl, this.onProgress);
        if (fallbackUrl) {
          const isSocks =
            fallbackUrl.startsWith('socks://') ||
            fallbackUrl.startsWith('socks5://') ||
            fallbackUrl.startsWith('socks4://');
          this.resolvedProxyAgent = isSocks
            ? new Socks5ProxyAgent(fallbackUrl)
            : new ProxyAgent(fallbackUrl);
          return this.resolvedProxyAgent;
        }

        return undefined;
      })();
    }

    return this.resolutionPromise;
  }
}
