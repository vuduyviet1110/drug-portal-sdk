import type { AuthProvider } from '../http/http-client.js';
import type { CsdlDuocConfig } from '../types/config.js';
import type { Logger } from '../http/logger.js';
import type { AuthState, AuthLoginResponse } from '../types/auth.js';
import {
  CSDL_DUOC_ENDPOINTS,
  DEFAULT_TOKEN_TTL_HOURS,
  TOKEN_REFRESH_MINUTES,
} from '../constants.js';
import { ProxyAgent } from 'undici';

/**
 * CSDL Dược (QĐ 522) authentication manager.
 *
 * Ported from Python `CsdlDuocService.login()` in csdlduoc_service.py:139-191.
 *
 * - POST /auth/login with x-www-form-urlencoded, password base64-encoded
 * - Caches token in memory
 * - Auto-refreshes when token expires within TOKEN_REFRESH_MINUTES (5 min)
 * - On 401: clears token, re-login, retry once
 */
export class CsdlDuocAuth implements AuthProvider {
  private readonly config: CsdlDuocConfig;
  private readonly baseUrl: string;
  private readonly logger: Logger;
  private readonly tokenTtlHours: number;
  private readonly onTokenChange?: (token: string, expiresAt: Date) => void;
  private readonly proxyAgent?: ProxyAgent;
  private state: AuthState | null = null;
  private loginPromise: Promise<void> | null = null;

  constructor(opts: {
    config: CsdlDuocConfig;
    baseUrl: string;
    logger: Logger;
    tokenTtlHours?: number;
    onTokenChange?: (token: string, expiresAt: Date) => void;
    proxyUrl?: string;
  }) {
    this.config = opts.config;
    this.baseUrl = opts.baseUrl;
    this.logger = opts.logger;
    this.tokenTtlHours = opts.tokenTtlHours ?? DEFAULT_TOKEN_TTL_HOURS;
    this.onTokenChange = opts.onTokenChange;
    this.proxyAgent = opts.proxyUrl ? new ProxyAgent(opts.proxyUrl) : undefined;
  }

  async getAuthHeaders(traceId?: string): Promise<Record<string, string>> {
    // LAZY LOGIN: Mỗi khi gửi request, HTTP Client gọi vào đây. 
    // Nếu token chưa có hoặc đã hết hạn (isTokenValid = false), nó sẽ tự động chờ lấy token mới.
    if (!this.isTokenValid()) {
      await this.login(false, traceId);
    }
    return { Authorization: `Bearer ${this.state!.accessToken}` };
  }

  async onUnauthorized(traceId?: string): Promise<boolean> {
    this.logger.warn('Token rejected (401) — clearing and re-logging in', { traceId });
    this.state = null;
    try {
      await this.login(true, traceId);
      return true;
    } catch (err) {
      this.logger.error('Re-login failed after 401', {
        error: (err as Error).message,
        traceId,
      });
      return false;
    }
  }

  /** Provide a pre-cached token (e.g. from database) to skip initial login */
  setCachedToken(token: string, expiresAt: Date): void {
    this.state = { accessToken: token, expiresAt };
    this.logger.info('Token loaded from cache', { expiresAt: expiresAt.toISOString() });
  }

  /** Returns current token state (for external persistence) */
  getState(): AuthState | null {
    return this.state;
  }

  private async login(force = false, traceId?: string): Promise<void> {
    if (!force && this.isTokenValid()) return;

    //CHỐNG DOG-PILING: Nếu có 10 request gọi API cùng lúc khi chưa có Token, 
    // chỉ request đầu tiên chạy xuống dưới để khởi tạo loginPromise. 9 request còn lại 
    // sẽ lọt vào if này và đứng im chờ cái Promise đó xong, tránh việc gọi login 10 lần.
    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = (async () => {
      this.logger.info('Authenticating with CSDL Dược', { baseUrl: this.baseUrl, traceId });

      const passwordB64 = Buffer.from(this.config.password, 'utf8').toString('base64');
      const body = {
        username: this.config.username,
        password: passwordB64,
      };

      const url = `${this.baseUrl}${CSDL_DUOC_ENDPOINTS.AUTH_LOGIN}`;

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(body).toString(),
          ...(this.proxyAgent ? { dispatcher: this.proxyAgent } : {}),
        } as any);

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`CSDL Dược login failed: HTTP ${resp.status} — ${text.slice(0, 200)}`);
        }

        const data = (await resp.json()) as AuthLoginResponse;
        const token = data.access_token ?? data.token;
        if (!token) {
          throw new Error('CSDL Dược login response missing access_token / token');
        }

        const expiresInHours = data.expires_in ? data.expires_in / 3600 : this.tokenTtlHours;
        const expiresAt = new Date(Date.now() + expiresInHours * 3600_000);

        this.state = { accessToken: token, expiresAt };
        this.logger.info('CSDL Dược authenticated', { expiresAt: expiresAt.toISOString(), traceId });

        if (this.onTokenChange) {
          try {
            this.onTokenChange(token, expiresAt);
          } catch (callbackErr) {
            this.logger.warn('Error in onTokenChange callback', {
              error: (callbackErr as Error).message,
              traceId,
            });
          }
        }
      } catch (err) {
        this.logger.error('CSDL Dược login error', { error: (err as Error).message, traceId });
        throw err;
      }
    })();

    try {
      await this.loginPromise;
    } finally {
      this.loginPromise = null;
    }
  }

  private isTokenValid(): boolean {
    if (!this.state) return false;
    //AUTO-REFRESH: Cấu hình khoảng đệm (buffer) là 5 phút (TOKEN_REFRESH_MINUTES).
    // Giả sử Token còn 4 phút nữa là hết hạn -> SDK coi như đã "chết" và trả về false.
    // Điều này đảm bảo Token luôn tươi mới, không bị chết giữa chừng lúc đang rớt mạng.
    const bufferMs = TOKEN_REFRESH_MINUTES * 60_000;
    return this.state.expiresAt.getTime() - bufferMs > Date.now();
  }
}
