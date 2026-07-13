import { HttpClient } from '../http/http-client.js';
import type {
  DrugSearchItem,
  DrugDetail,
  DrugSearchOptions,
  DrugSearchResult,
  DrugPackaging,
} from '../types/drugs.js';
import type { Logger } from '../http/logger.js';
import { CSDL_DUOC_ENDPOINTS } from '../constants.js';

/**
 * Drug catalog and search operations.
 *
 * Ported from Python `CsdlDuocService.search_master_drugs()`, `get_master_drug()`,
 * `search_pos_products()`, `search_drugs_for_wizard()` +
 * `MasterDataMapper.normalize_drug_list_item()`, `parse_pos_search_response()`.
 */
export class DrugClient {
  private readonly http: HttpClient;
  private readonly portalHttp: HttpClient;
  private readonly logger: Logger;

  constructor(http: HttpClient, portalHttp: HttpClient, logger: Logger) {
    this.http = http;
    this.portalHttp = portalHttp;
    this.logger = logger;
  }

  /**
   * Unified drug search — POS portal first, fallback to master catalog.
   * Ported from `CsdlDuocService.search_drugs_for_wizard()`.
   */
  async search(keyword: string, opts: DrugSearchOptions = {}): Promise<DrugSearchResult> {
    const { page = 1, pageSize = 20, source = 'auto' } = opts;

    if (source === 'pos' || source === 'auto') {
      try {
        const result = await this.searchPos(keyword, { page, pageSize });
        if (result.items.length > 0) return result;
      } catch (err) {
        this.logger.warn('POS drug search failed, trying master catalog', {
          error: (err as Error).message,
        });
      }
    }

    if (source === 'master' || source === 'auto') {
      return this.searchMaster(keyword, { page, pageSize });
    }

    return { items: [], total: 0 };
  }

  /** POS portal search (richer results, uses /api/pos/product/get-paged) */
  async searchPos(
    keyword: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<DrugSearchResult> {
    const { page = 1, pageSize = 20 } = opts;
    const skipCount = Math.max(0, (page - 1) * pageSize);
    const nowMs = Date.now();

    const body = {
      filter: keyword || '',
      isShowAdvanceSearch: false,
      onSearchBeginning: nowMs,
      isActived: null,
      type: 1,
      skipCount,
      maxResultCount: pageSize,
      sorting: '',
      version: nowMs,
    };

    const data = await this.portalHttp.post<Record<string, unknown>>(
      CSDL_DUOC_ENDPOINTS.POS_PRODUCT_GET_PAGED,
      body,
    );

    return parsePosResponse(data);
  }

  /** Master catalog search (GET /master/drugs) */
  async searchMaster(
    keyword: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<DrugSearchResult> {
    const { page = 1, pageSize = 20 } = opts;
    const data = await this.http.get<Record<string, unknown>>(CSDL_DUOC_ENDPOINTS.MASTER_DRUGS, {
      queryParams: { search: keyword, page, page_size: pageSize },
    });
    return parseMasterResponse(data, 'master');
  }

  /** Get full drug detail by ID (GET /master/drugs/{drugId}) */
  async getDetail(drugId: string): Promise<DrugDetail> {
    const data = await this.http.get<Record<string, unknown>>(
      `${CSDL_DUOC_ENDPOINTS.MASTER_DRUGS}/${encodeURIComponent(drugId)}`,
    );
    return mapDrugDetail(data);
  }
}

// ─── Response parsers ────────────────────────────────────────────

function parsePosResponse(data: Record<string, unknown>): DrugSearchResult {
  // Port of MasterDataMapper.parse_pos_search_response()
  // POS response shape: { result: { items: [...], total: N } } or { items: [...], totalCount: N } or { data: [...] }
  let rawItems: Array<Record<string, unknown>> = [];
  let total = 0;

  const result = data['result'] as Record<string, unknown> | undefined;
  if (result && typeof result === 'object') {
    rawItems = (result['items'] as Array<Record<string, unknown>>) ?? [];
    total = (result['total'] as number) ?? rawItems.length;
  } else if (Array.isArray(data['items'])) {
    rawItems = data['items'] as Array<Record<string, unknown>>;
    total = (data['totalCount'] ?? data['total'] ?? rawItems.length) as number;
  } else if (Array.isArray(data['data'])) {
    rawItems = data['data'] as Array<Record<string, unknown>>;
    total = rawItems.length;
  }

  const items: DrugSearchItem[] = rawItems.map((item) => ({
    id: (item['drugId'] ?? item['id'] ?? '') as string,
    name: (item['productName'] ?? item['tenThuoc'] ?? item['name'] ?? '') as string,
    registrationNumber: item['registrationNumber'] as string | undefined,
    baseUnit: item['baseUnit'] as string | undefined,
    source: 'pos' as const,
    raw: item,
  }));

  return { items, total };
}

function parseMasterResponse(
  data: Record<string, unknown>,
  source: 'pos' | 'master',
): DrugSearchResult {
  const rawItems = (data['items'] ?? data['data'] ?? []) as Array<Record<string, unknown>>;
  const total = (data['total'] as number) ?? rawItems.length;

  const items: DrugSearchItem[] = rawItems.map((item) => ({
    id: (item['id'] ?? item['drugId'] ?? '') as string,
    name: (item['name'] ?? item['tenThuoc'] ?? '') as string,
    registrationNumber: (item['registration_number'] ?? item['so_dang_ky']) as string | undefined,
    baseUnit: (item['base_unit'] ?? item['don_vi_co_ban']) as string | undefined,
    source,
    raw: item,
  }));

  return { items, total };
}

function mapDrugDetail(data: Record<string, unknown>): DrugDetail {
  const packagings = (data['packagings'] ?? []) as DrugPackaging[];
  const basicPkg = packagings.find((p) => p.isBasicUnit === true) ?? packagings[0];
  const retailPkg = packagings.find((p) => p.isBasicUnit !== true) ?? basicPkg;

  const conversionRate = retailPkg?.conversionRateToBase ?? retailPkg?.quantity ?? 1.0;

  const gtin = (data['gtin'] as string | undefined) ?? basicPkg?.gtin ?? retailPkg?.gtin;

  const ingredients = (data['active_ingredient_list'] ?? []) as Array<Record<string, unknown>>;
  const activePharmaceuticalIngredient = data['active_pharmaceutical_ingredient'] as
    string | undefined;

  const routes = (data['routes'] ?? []) as Array<Record<string, unknown>>;
  const route = routes[0];
  const manufacturer = data['manufacturer'] as Record<string, unknown> | undefined;

  return {
    id: (data['id'] ?? '') as string,
    maThuocQg: data['ma_thuoc_qg'] as string | undefined,
    name: (data['name'] ?? data['ten_thuoc'] ?? '') as string,
    registrationNumber: data['so_dang_ky'] as string | undefined,
    strength: data['strength'] as string | undefined,
    drugGroupId: data['drug_group_id'] as string | undefined,
    prescriptionStatus: data['prescription_status'] as string | undefined,
    specialControlType: data['special_control_type'] as number | undefined,
    dosageForm: data['dang_bao_che'] as string | undefined,
    gtin,
    brandName: data['brand_name'] as string | undefined,
    approvalDate: data['approval_date'] as string | undefined,
    expiryDate: data['expiry_date'] as string | undefined,
    isPrescriptionDrug: data['la_thuoc_ke_don'] as boolean | undefined,
    route: route ? { id: route['id'] as string, name: route['name'] as string } : undefined,
    manufacturer: manufacturer
      ? {
          id: manufacturer['id'] as string | undefined,
          name: manufacturer['name'] as string | undefined,
          address: manufacturer['address'] as string | undefined,
          country: manufacturer['country'] as string | undefined,
        }
      : undefined,
    activeIngredients: ingredients.map((i) => ({
      id: i['id'] as string | undefined,
      name: i['name'] as string | undefined,
      concentration: i['concentration'] as string | undefined,
      isMainActiveIngredient: i['is_main_active_ingredient'] as boolean | undefined,
      type: i['type'] as number | undefined,
    })),
    activePharmaceuticalIngredient,
    packagings,
    basicUnitId: basicPkg?.id,
    basicUnitName: basicPkg?.unitName,
    retailUnitId: retailPkg?.id,
    retailUnitName: retailPkg?.unitName,
    conversionRate,
    countryOfManufacture: data['nuoc_san_xuat'] as string | undefined,
    raw: data,
  };
}
