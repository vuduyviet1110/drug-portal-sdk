import type { AuthProvider } from '../http/http-client.js';
import type { Qd228Config } from '../types/config.js';
import type { Logger } from '../http/logger.js';

/**
 * QĐ 228 (Cổng Đơn Thuốc Quốc Gia) authentication provider.
 *
 * Ported from Python `NationalRxService._headers()` in national_rx_service.py:44.
 *
 * - Static app-name / app-key headers — no OAuth, no refresh.
 * - app-key is masked in logs.
 */
export class Qd228Auth implements AuthProvider {
  private readonly config: Qd228Config;
  private readonly logger: Logger;

  constructor(config: Qd228Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async getAuthHeaders(_traceId?: string): Promise<Record<string, string>> {
    return {
      'app-name': this.config.appName,
      'app-key': this.config.appKey,
    };
  }

  /** QĐ 228 has no refresh — always returns false (no retry allowed) */
  async onUnauthorized(traceId?: string): Promise<boolean> {
    this.logger.error('QĐ 228 returned 401 — static credentials may be invalid', { traceId });
    return false;
  }
}
