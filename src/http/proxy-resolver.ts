import { ProxyAgent, Socks5ProxyAgent, fetch } from 'undici';

let cachedFallbackProxy: string | null = null;
let isScraping = false;

const GEONODE_PROXY_PAGES = 3;
const GEONODE_PROXY_LIMIT = 20;
const PROXY_TEST_BATCH_SIZE = 30;

type ProxySource =
  'geonode' | 'proxyscrape-http' | 'proxyscrape-socks5' | 'proxifly' | 'proxy-list-download';

export type ScrapedProxy = {
  url: string;
  source: ProxySource;
};

type GeonodeProxy = { ip: string; port: string; protocols: string[] };

type ProxiflyEntry = {
  proxy?: string;
  protocol?: string;
  ip?: string;
  port?: number;
};

function toHttpProxyUrl(ip: string, port: string | number): string {
  return `http://${ip}:${port}`;
}

function toSocks5ProxyUrl(ip: string, port: string | number): string {
  return `socks5://${ip}:${port}`;
}

function parseIpPortLines(
  text: string,
  protocol: 'http' | 'socks5',
  source: ProxySource,
): ScrapedProxy[] {
  const toUrl = protocol === 'http' ? toHttpProxyUrl : toSocks5ProxyUrl;
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(line))
    .map((line) => {
      const [ip, port] = line.split(':');
      return { url: toUrl(ip!, port!), source };
    });
}

function geonodeToProxyUrl(proxy: GeonodeProxy): string {
  const isHttps = proxy.protocols.includes('https');
  const isHttp = proxy.protocols.includes('http');
  const protocol = isHttps || isHttp ? 'http' : 'socks5';
  return `${protocol}://${proxy.ip}:${proxy.port}`;
}

async function safeFetchText(url: string, timeoutMs = 12_000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    return null;
  }
}

async function fetchGeonodeProxies(): Promise<ScrapedProxy[]> {
  const proxies: ScrapedProxy[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= GEONODE_PROXY_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(GEONODE_PROXY_LIMIT),
      page: String(page),
      sort_by: 'lastChecked',
      sort_type: 'desc',
      country: 'VN',
      protocols: 'http,https,socks5',
    });
    const text = await safeFetchText(`https://proxylist.geonode.com/api/proxy-list?${params}`);
    if (!text) break;

    const json = JSON.parse(text) as { data?: GeonodeProxy[] };
    const batch = json.data || [];
    for (const proxy of batch) {
      const key = `${proxy.ip}:${proxy.port}`;
      if (!seen.has(key)) {
        seen.add(key);
        proxies.push({ url: geonodeToProxyUrl(proxy), source: 'geonode' });
      }
    }
    if (batch.length < GEONODE_PROXY_LIMIT) break;
  }

  return proxies;
}

async function fetchProxyScrape(protocol: 'http' | 'socks5'): Promise<ScrapedProxy[]> {
  const params = new URLSearchParams({
    request: 'displayproxies',
    protocol,
    timeout: '10000',
    country: 'VN',
    ssl: 'all',
    anonymity: 'all',
  });
  const text = await safeFetchText(`https://api.proxyscrape.com/v2/?${params}`);
  if (!text?.trim()) return [];
  return parseIpPortLines(
    text,
    protocol,
    protocol === 'http' ? 'proxyscrape-http' : 'proxyscrape-socks5',
  );
}

async function fetchProxiflyProxies(): Promise<ScrapedProxy[]> {
  const text = await safeFetchText(
    'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/countries/VN/data.json',
  );
  if (!text?.trim()) return [];

  try {
    const entries = JSON.parse(text) as ProxiflyEntry[];
    const proxies: ScrapedProxy[] = [];

    for (const entry of entries) {
      if (entry.proxy) {
        proxies.push({ url: entry.proxy, source: 'proxifly' });
        continue;
      }
      if (entry.ip && entry.port) {
        const protocol = entry.protocol === 'socks5' ? 'socks5' : 'http';
        const url =
          protocol === 'socks5'
            ? toSocks5ProxyUrl(entry.ip, entry.port)
            : toHttpProxyUrl(entry.ip, entry.port);
        proxies.push({ url, source: 'proxifly' });
      }
    }

    return proxies;
  } catch (err) {
    return [];
  }
}

async function fetchProxyListDownload(type: 'http' | 'https'): Promise<ScrapedProxy[]> {
  const text = await safeFetchText(
    `https://www.proxy-list.download/api/v1/get?type=${type}&country=VN`,
  );
  if (!text?.trim() || text.toLowerCase().includes('error')) return [];
  return parseIpPortLines(text, 'http', 'proxy-list-download');
}

function dedupeProxies(proxies: ScrapedProxy[]): ScrapedProxy[] {
  const seen = new Set<string>();
  const result: ScrapedProxy[] = [];
  for (const proxy of proxies) {
    const key = proxy.url.replace(/^https?:\/\//, 'http://');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(proxy);
  }
  return result;
}

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
    const id = setTimeout(() => controller.abort(), 4000);

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
 * Scrapes and finds a working proxy in Vietnam using multiple sources.
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
    onProgress?.(
      'scraping_proxies',
      'Đang quét proxy VN từ nhiều nguồn (Geonode, ProxyScrape, Proxifly, Proxy-List)...',
    );

    const results = await Promise.allSettled([
      fetchGeonodeProxies(),
      fetchProxyScrape('http'),
      fetchProxyScrape('socks5'),
      fetchProxiflyProxies(),
      fetchProxyListDownload('http'),
      fetchProxyListDownload('https'),
    ]);

    const merged: ScrapedProxy[] = [];
    const sourceCounts: Record<string, number> = {};

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const proxy of result.value) {
        merged.push(proxy);
        sourceCounts[proxy.source] = (sourceCounts[proxy.source] || 0) + 1;
      }
    }

    const unique = dedupeProxies(merged);
    const summary = Object.entries(sourceCounts)
      .map(([source, count]) => `${source}: ${count}`)
      .join(', ');

    onProgress?.(
      'scraping_done',
      `Đã thu thập ${unique.length} proxy VN từ ${Object.keys(sourceCounts).length || 0} nguồn (${summary || 'không có nguồn nào phản hồi'}).`,
    );

    if (unique.length === 0) return null;

    onProgress?.(
      'testing_proxies',
      `Đã quét được ${unique.length} proxy. Đang kiểm tra kết nối song song (theo lô ${PROXY_TEST_BATCH_SIZE})...`,
    );

    for (let i = 0; i < unique.length; i += PROXY_TEST_BATCH_SIZE) {
      const batch = unique.slice(i, i + PROXY_TEST_BATCH_SIZE);
      const batchNumber = Math.floor(i / PROXY_TEST_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(unique.length / PROXY_TEST_BATCH_SIZE);

      onProgress?.(
        'testing_proxy_batch',
        `Đang test lô ${batchNumber}/${totalBatches} (${batch.length} proxy)...`,
      );

      const testPromises = batch.map(async (proxy) => {
        const works = await testProxy(baseUrl, proxy.url);
        return works ? proxy.url : null;
      });

      const batchResults = await Promise.all(testPromises);
      const workingProxy = batchResults.find((url) => url !== null);

      if (workingProxy) {
        onProgress?.('proxy_found', `Đã tìm thấy proxy kết nối CSDL Dược ổn định: ${workingProxy}`);
        cachedFallbackProxy = workingProxy;
        return workingProxy;
      }
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
  private onProxyResolved?: (proxyUrl: string) => void | Promise<void>;
  private targetBaseUrl: string;

  private resolvedProxyAgent?: ProxyAgent | Socks5ProxyAgent;
  private resolutionPromise?: Promise<ProxyAgent | Socks5ProxyAgent | undefined>;

  constructor(opts: {
    proxyUrl?: string;
    autoFallback?: boolean;
    onProgress?: (step: string, message: string) => void;
    onProxyResolved?: (proxyUrl: string) => void | Promise<void>;
    targetBaseUrl: string;
  }) {
    this.proxyUrl = opts.proxyUrl;
    this.autoFallback = opts.autoFallback;
    this.onProgress = opts.onProgress;
    this.onProxyResolved = opts.onProxyResolved;
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

          if (this.onProxyResolved) {
            try {
              await this.onProxyResolved(fallbackUrl);
            } catch (err) {
              // Ignore callback errors
            }
          }
          return this.resolvedProxyAgent;
        }

        return undefined;
      })();
    }

    return this.resolutionPromise;
  }

  /**
   * Clears the resolved proxy cache so we can try to resolve a new one.
   */
  clearResolved(): void {
    this.resolvedProxyAgent = undefined;
    this.resolutionPromise = undefined;
    clearFallbackProxyCache();
  }
}
