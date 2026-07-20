import type { SDKConfig } from './types/config.js';
import {
  resolveCsdlDuocBaseUrl,
  resolveNationalRxBaseUrl,
  resolvePortalApiRoot,
} from './types/config.js';
import { CsdlDuocAuth } from './auth/csdl-duoc-auth.js';
import { Qd228Auth } from './auth/qd228-auth.js';
import { HttpClient } from './http/http-client.js';
import { StructuredLogger } from './http/logger.js';
import type { Logger } from './http/logger.js';
import { CsdlDuocClient } from './csdl-duoc/index.js';
import { Qd228Client } from './qd228/index.js';

/**
 * Main SDK entry point — DrugPortalClient
 *
 * ```typescript
 * import { DrugPortalClient } from '@icare1/drug-portal-sdk';
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

    if (config.useMock) {
      if (!config.csdlDuoc) {
        config.csdlDuoc = { username: 'mock_user', password: 'mock_password' };
      }
      if (!config.qd228) {
        config.qd228 = { appName: 'mock_app', appKey: 'mock_key' };
      }
    }

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
        proxyUrl: config.proxyUrl,
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
          proxyUrl: config.proxyUrl,
        },
        csdlDuocAuth,
      );
    }

    // Portal HTTP client (strips /v2) for POS API
    const portalHttp = mainHttp
      ? new HttpClient(
          {
            baseUrl: resolvePortalApiRoot(csdlDuocBaseUrl),
            logger: this.logger,
            retry: config.retry,
            proxyUrl: config.proxyUrl,
          },
          csdlDuocAuth,
        )
      : undefined;

    this.csdlDuoc = new CsdlDuocClient(mainHttp!, portalHttp!, this.logger, csdlDuocAuth!, {
      storeId: config.csdlDuoc?.storeId,
      warehouseCode: config.csdlDuoc?.warehouseCode,
    });

    // ─── QĐ 228 (Cổng Đơn Thuốc) ──────────────────────────────────

    if (config.qd228) {
      const nationalRxBaseUrl = resolveNationalRxBaseUrl(config);
      const qd228Auth = new Qd228Auth(config.qd228, this.logger);

      const qd228Http = new HttpClient(
        {
          baseUrl: nationalRxBaseUrl,
          logger: this.logger,
          retry: config.retry,
          proxyUrl: config.proxyUrl,
        },
        qd228Auth,
      );

      // Inject default headers (app-name, app-key) into every request
      this.qd228 = new Qd228Client(qd228Http, this.logger);
    }

    if (config.useMock) {
      this.enableMockMode();
    }

    this.logger.info('DrugPortalClient initialized', {
      environment: config.environment,
      hasCsdlDuoc: !!config.csdlDuoc,
      hasQd228: !!config.qd228,
      useMock: !!config.useMock,
    });
  }

  private enableMockMode() {
    this.logger.info('[Mock Client] Mock mode enabled. Intercepting API calls.');

    this.csdlDuoc.drugs.search = async (keyword: string) => {
      const mockDrugs = [
        {
          id: '1',
          name: 'Paracetamol 500mg (Mock)',
          registrationNumber: 'VD-12345-20',
          baseUnit: 'Viên',
          source: 'pos' as const,
        },
        {
          id: '2',
          name: 'Ibuprofen 400mg (Mock)',
          registrationNumber: 'VD-67890-21',
          baseUnit: 'Viên',
          source: 'master' as const,
        },
      ];
      const items = mockDrugs.filter((d) =>
        d.name.toLowerCase().includes(keyword.toLowerCase()),
      );
      return { items, total: items.length };
    };

    this.csdlDuoc.drugs.getDetail = async (id: string) => {
      return {
        id,
        name: 'Mock Drug Detail',
        registrationNumber: 'VD-12345-20',
        packagings: [],
        activeIngredients: [],
        conversionRate: 1,
        raw: {},
      };
    };

    this.csdlDuoc.inventory.stockIn = async () => {
      return {
        transactionId: 'tx-mock-in-' + Date.now(),
        status: 'completed',
        attempts: 1,
        timedOut: false,
        raw: { messages: ['Mock synchronization successful'] }
      };
    };

    this.csdlDuoc.inventory.stockOut = async () => {
      return {
        transactionId: 'tx-mock-out-' + Date.now(),
        status: 'completed',
        attempts: 1,
        timedOut: false,
        raw: { messages: ['Mock synchronization successful'] }
      };
    };

    this.csdlDuoc.inventory.stockTaking = async () => {
      return {
        transactionId: 'tx-mock-take-' + Date.now(),
        status: 'completed',
        attempts: 1,
        timedOut: false,
        raw: { messages: ['Mock synchronization successful'] }
      };
    };

    if (this.qd228) {
      this.qd228.prescriptions.get = async (code: string) => {
        return {
          maDonThuoc: code,
          patientName: 'Nguyen Van A (Mock)',
          patientBirthDate: '1990-01-01',
          diagnosis: 'Cảm cúm',
          doctorName: 'Dr. John Doe',
          facilityName: 'Bệnh viện Bạch Mai',
          items: [
            {
              drugCode: '1',
              drugName: 'Paracetamol 500mg (Mock)',
              unitName: 'Viên',
              prescribedQuantity: 10,
              price: 1000,
            },
          ],
          raw: {},
        };
      };
      this.qd228.prescriptions.updateSaleQty = async () => {
        return {
          success: true,
          status: 200,
          data: {},
        };
      };
    }
  }
}
