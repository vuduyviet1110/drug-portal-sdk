import type { AuthProvider } from '../http/http-client.js';
import type { CsdlDuocConfig } from '../types/config.js';
import type { Logger } from '../http/logger.js';
import type { AuthState, AuthLoginResponse } from '../types/auth.js';
import { CSDL_DUOC_ENDPOINTS, DEFAULT_TOKEN_TTL_HOURS, TOKEN_REFRESH_MINUTES } from '../constants.js';

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
  private state: AuthState | null = null;

  constructor(opts: {
    config: CsdlDuocConfig;
    baseUrl: string;
    logger: Logger;
    tokenTtlHours?: number;
    onTokenChange?: (token: string, expiresAt: Date) => void;
  }) {
    this.config = opts.config;
    this.baseUrl = opts.baseUrl;
    this.logger = opts.logger;
    this.tokenTtlHours = opts.tokenTtlHours ?? DEFAULT_TOKEN_TTL_HOURS;
    this.onTokenChange = opts.onTokenChange;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.isTokenValid()) {
      await this.login();
    }
    return { Authorization: `Bearer ${this.state!.accessToken}` };
  }

  /** Called when a 401 is received — clears cached token and re-logs in. */
  async onUnauthorized(): Promise<boolean> {
    this.logger.warn('Token rejected (401) — clearing and re-logging in');
    this.state = null;
    try {
      await this.login(true);
      return true;
    } catch (err) {
      this.logger.error('Re-login failed after 401', {
        error: (err as Error).message,
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

  private async login(force = false): Promise<void> {
    if (!force && this.isTokenValid()) return;

    this.logger.info('Authenticating with CSDL Dược', { baseUrl: this.baseUrl });

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
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`CSDL Dược login failed: HTTP ${resp.status} — ${text.slice(0, 200)}`);
      }

      const data = (await resp.json()) as AuthLoginResponse;
      const token = data.access_token ?? data.token;
      if (!token) {
        throw new Error('CSDL Dược login response missing access_token / token');
      }

      const expiresInHours = data.expires_in
        ? data.expires_in / 3600
        : this.tokenTtlHours;
      const expiresAt = new Date(Date.now() + expiresInHours * 3600_000);

      this.state = { accessToken: token, expiresAt };
      this.logger.info('CSDL Dược authenticated', { expiresAt: expiresAt.toISOString() });

      if (this.onTokenChange) {
        this.onTokenChange(token, expiresAt);
      }
    } catch (err) {
      this.logger.error('CSDL Dược login error', { error: (err as Error).message });
      throw err;
    }
  }

  private isTokenValid(): boolean {
    if (!this.state) return false;
    const bufferMs = TOKEN_REFRESH_MINUTES * 60_000;
    return this.state.expiresAt.getTime() - bufferMs > Date.now();
  }
}
