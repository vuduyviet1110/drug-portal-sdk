import type { Environment } from '../constants.js';
import type { RetryOptions } from '../http/retry.js';
import type { Logger } from '../http/logger.js';

/** Credentials for CSDL Dược (QĐ 522) */
export interface CsdlDuocConfig {
  username: string;
  password: string;
  /** Optional: store_id for transaction payloads */
  storeId?: string;
  /** Optional: warehouse code for transaction payloads */
  warehouseCode?: string;
}

/** Credentials for Cổng Đơn Thuốc (QĐ 228) */
export interface Qd228Config {
  appName: string;
  appKey: string;
}

/** Top-level SDK configuration */
export interface SDKConfig {
  /** 'sandbox' or 'production' — determines API base URLs */
  environment: Environment;

  /** CSDL Dược (QĐ 522) credentials */
  csdlDuoc?: CsdlDuocConfig;

  /** Cổng Đơn Thuốc (QĐ 228) credentials */
  qd228?: Qd228Config;

  /** Override CSDL Dược base URL (takes priority over environment) */
  csdlDuocBaseUrl?: string;

  /** Override QĐ 228 base URL */
  nationalRxBaseUrl?: string;

  /** Retry behaviour for all HTTP calls */
  retry?: RetryOptions;

  /** Custom logger — defaults to built-in StructuredLogger */
  logger?: Logger;

  /** Token TTL in hours — default 23h */
  tokenTtlHours?: number;

  /**
   * Callback invoked when the CSDL Dược auth token changes.
   * Use this to persist tokens externally (e.g. to a database).
   */
  onTokenChange?: (token: string, expiresAt: Date) => void;

  /**
   * Provide a previously-cached token to skip the initial login.
   */
  cachedToken?: string;

  /**
   * Expiry timestamp for the cached token.
   */
  cachedTokenExpiresAt?: Date;

  /**
   * Optional: Proxy server URL (e.g. 'http://username:password@vietnam-proxy-ip:port')
   * to bypass firewall restrictions when deployed in cloud environments.
   */
  proxyUrl?: string;
}

/** Resolve the CSDL Dược base URL from config */
export function resolveCsdlDuocBaseUrl(config: SDKConfig): string {
  if (config.csdlDuocBaseUrl) return config.csdlDuocBaseUrl;
  return config.environment === 'production'
    ? 'https://api.csdlduoc.com.vn/v2'
    : 'https://api-sandbox.csdlduoc.com.vn/v2';
}

/** Resolve the POS portal base URL (strips /v2 suffix) */
export function resolvePortalApiRoot(baseUrl: string): string {
  return baseUrl.replace(/\/v2\/?$/, '');
}

/** Resolve the QĐ 228 base URL from config */
export function resolveNationalRxBaseUrl(config: SDKConfig): string {
  return config.nationalRxBaseUrl ?? 'https://donthuocquocgia.vn';
}
