import type { SDKConfig } from './types/config.js';
import { resolveCsdlDuocBaseUrl, resolveNationalRxBaseUrl } from './types/config.js';
import { CsdlDuocAuth } from './auth/csdl-duoc-auth.js';
import { Qd228Auth } from './auth/qd228-auth.js';
import { HttpClient } from './http/http-client.js';
import { StructuredLogger } from './http/logger.js';
import type { Logger } from './http/logger.js';
import { CsdlDuocClient } from './csdl-duoc/index.js';
import { Qd228Client } from './qd228/index.js';
import { DrugPortalError } from './http/http-client.js';

export {
  DrugPortalError,
  CsdlDuocAuth,
  Qd228Auth,
  StructuredLogger,
  CsdlDuocClient,
  Qd228Client,
};

// Re-export all types
export type * from './types/config.js';
export type * from './types/auth.js';
export type * from './types/common.js';
export type * from './types/drugs.js';
export type * from './types/inventory.js';
export type * from './types/prescriptions.js';

/**
 * Main SDK entry point — DrugPortalClient
 *
 * ```typescript
 * import { DrugPortalClient } from '@icare/drug-portal-sdk';
 *
 * const client = new DrugPortalClient({
 *   environment: 'sandbox',
 *   csdlDuoc: { username: '...', password: '...' },
 *   qd228: { appName: '...', appKey: '...' },
 * });
 *
 * // CSDL Dược (QĐ 522)
 * const drugs = await client.csdlDuoc.drugs.search('paracetamol');
 * const txId = await client.csdlDuoc.inventory.stockIn({ items, reason: 'supplier' });
 *
 * // Cổng Đơn Thuốc (QĐ 228)
 * const rx = await client.qd228.prescriptions.get('DH001');
 * ```
 */
export class DrugPortalClient {
  /** CSDL Dược (QĐ 522) sub-client */
  readonly csdlDuoc: CsdlDuocClient;

  /** Cổng Đơn Thuốc (QĐ 228) sub-client — undefined if no qd228 config provided */
  readonly qd228?: Qd228Client;

  private readonly logger: Logger;

  constructor(config: SDKConfig) {
    this.logger = config.logger ?? new StructuredLogger('DrugPortalSDK');

    // ─── CSDL Dược (QĐ 522) ───────────────────────────────────────

    const csdlDuocBaseUrl = resolveCsdlDuocBaseUrl(config);

    let csdlDuocAuth: CsdlDuocAuth | undefined;
    let mainHttp: HttpClient | undefined;

    if (config.csdlDuoc) {
      csdlDuocAuth = new CsdlDuocAuth({
        config: config.csdlDuoc,
        baseUrl: csdlDuocBaseUrl,
        logger: this.logger,
        tokenTtlHours: config.tokenTtlHours,
        onTokenChange: config.onTokenChange,
      });

      // Restore cached token if provided
      if (config.cachedToken && config.cachedTokenExpiresAt) {
        csdlDuocAuth.setCachedToken(config.cachedToken, config.cachedTokenExpiresAt);
      }

      mainHttp = new HttpClient(
        {
          baseUrl: csdlDuocBaseUrl,
          logger: this.logger,
          retry: config.retry,
        },
        csdlDuocAuth,
      );
    }

    // Portal HTTP client (strips /v2) for POS API
    const portalHttp = mainHttp
      ? new HttpClient(
          {
            baseUrl: csdlDuocBaseUrl.replace(/\/v2\/?$/, ''),
            logger: this.logger,
            retry: config.retry,
          },
          csdlDuocAuth,
        )
      : undefined;

    this.csdlDuoc = new CsdlDuocClient(
      mainHttp!,
      portalHttp!,
      this.logger,
      csdlDuocAuth!,
      {
        storeId: config.csdlDuoc?.storeId,
        warehouseCode: config.csdlDuoc?.warehouseCode,
      },
    );

    // ─── QĐ 228 (Cổng Đơn Thuốc) ──────────────────────────────────

    if (config.qd228) {
      const nationalRxBaseUrl = resolveNationalRxBaseUrl(config);
      const qd228Auth = new Qd228Auth(config.qd228, this.logger);

      const qd228Http = new HttpClient(
        {
          baseUrl: nationalRxBaseUrl,
          logger: this.logger,
          retry: config.retry,
        },
        qd228Auth,
      );

      // Inject default headers (app-name, app-key) into every request
      this.qd228 = new Qd228Client(qd228Http, this.logger);
    }

    this.logger.info('DrugPortalClient initialized', {
      environment: config.environment,
      hasCsdlDuoc: !!config.csdlDuoc,
      hasQd228: !!config.qd228,
    });
  }
}

// Default export for convenience
export default DrugPortalClient;
