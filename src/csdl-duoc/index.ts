import { DrugClient } from './drugs.js';
import { MasterDataClient } from './master-data.js';
import { InventoryClient } from './inventory.js';
import type { HttpClient } from '../http/http-client.js';
import type { Logger } from '../http/logger.js';

export interface CsdlDuocClientOptions {
  baseUrl?: string;
  storeId?: string;
  warehouseCode?: string;
}

/**
 * Aggregated CSDL Dược (QĐ 522) client.
 *
 * Groups drugs, masterData, and inventory sub-clients.
 * Uses two HTTP clients:
 * - Main HTTP client: uses base URL with /v2 suffix (for auth, master data, inventory)
 * - Portal HTTP client: strips /v2 suffix (for POS portal API)
 */
export class CsdlDuocClient {
  readonly drugs: DrugClient;
  readonly masterData: MasterDataClient;
  readonly inventory: InventoryClient;

  constructor(
    http: HttpClient,
    portalHttp: HttpClient,
    logger: Logger,
    _auth: unknown,
    opts?: CsdlDuocClientOptions,
  ) {
    this.drugs = new DrugClient(http, portalHttp, logger);
    this.masterData = new MasterDataClient(http);
    this.inventory = new InventoryClient(http, logger, {
      storeId: opts?.storeId,
      warehouseCode: opts?.warehouseCode,
    });
  }
}
