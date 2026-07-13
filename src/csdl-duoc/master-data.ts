import { HttpClient } from '../http/http-client.js';
import type {
  MasterUnit,
  MasterRoute,
  MasterCountry,
  MasterDrugGroup,
  MasterManufacturer,
  MasterActiveIngredient,
} from '../types/drugs.js';
import { CSDL_DUOC_ENDPOINTS } from '../constants.js';

/**
 * Master data lookups for CSDL Dược.
 *
 * Ported from Python `CsdlDuocService.search_master_units()`, `search_master_routes()` etc.
 */
export class MasterDataClient {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async getUnits(
    keyword?: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<MasterUnit[]> {
    return this.fetchList<MasterUnit>(CSDL_DUOC_ENDPOINTS.MASTER_UNITS, keyword, opts);
  }

  async getRoutes(
    keyword?: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<MasterRoute[]> {
    return this.fetchList<MasterRoute>(CSDL_DUOC_ENDPOINTS.MASTER_ROUTES, keyword, opts);
  }

  async getCountries(
    keyword?: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<MasterCountry[]> {
    return this.fetchList<MasterCountry>(CSDL_DUOC_ENDPOINTS.MASTER_COUNTRIES, keyword, opts);
  }

  async getDrugGroups(
    keyword?: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<MasterDrugGroup[]> {
    return this.fetchList<MasterDrugGroup>(
      CSDL_DUOC_ENDPOINTS.MASTER_DRUG_GROUPS,
      keyword,
      opts,
    );
  }

  async getManufacturers(
    keyword?: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<MasterManufacturer[]> {
    return this.fetchList<MasterManufacturer>(
      CSDL_DUOC_ENDPOINTS.MASTER_MANUFACTURERS,
      keyword,
      opts,
    );
  }

  async getActiveIngredients(
    keyword?: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<MasterActiveIngredient[]> {
    return this.fetchList<MasterActiveIngredient>(
      CSDL_DUOC_ENDPOINTS.MASTER_ACTIVE_INGREDIENTS,
      keyword,
      opts,
    );
  }

  private async fetchList<T>(
    endpoint: string,
    keyword?: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<T[]> {
    const { page = 1, pageSize = 100 } = opts;
    const queryParams: Record<string, string | number | undefined> = {
      page,
      page_size: pageSize,
    };
    if (keyword) queryParams['search'] = keyword;

    const data = await this.http.get<Record<string, unknown>>(endpoint, { queryParams });
    return (data['items'] ?? data['data'] ?? []) as T[];
  }
}
