import type { PaginationOptions, PaginatedResponse } from './common.js';

// ─── Drug search result ──────────────────────────────────────────

export interface DrugSearchItem {
  /** National drug ID (ma_thuoc_qg) */
  id: string;
  /** Drug name (ten_thuoc) */
  name: string;
  /** Registration number (so_dang_ky) */
  registrationNumber?: string;
  /** Base unit name (don_vi_co_ban) */
  baseUnit?: string;
  /** Source: 'pos' | 'master' */
  source: 'pos' | 'master';
  /** Raw API response data */
  raw?: Record<string, unknown>;
}

export interface DrugSearchOptions extends PaginationOptions {
  /** Source preference — default 'auto' (POS first, fallback master) */
  source?: 'auto' | 'pos' | 'master';
}

// ─── Drug detail (from GET /master/drugs/{id}) ──────────────────

export interface DrugPackaging {
  id?: string;
  isBasicUnit?: boolean;
  unitName?: string;
  quantity?: number;
  conversionRateToBase?: number;
  gtin?: string;
  [key: string]: unknown;
}

export interface DrugManufacturer {
  id?: string;
  name?: string;
  address?: string;
  country?: string;
  [key: string]: unknown;
}

export interface DrugActiveIngredient {
  id?: string;
  name?: string;
  concentration?: string;
  isMainActiveIngredient?: boolean;
  type?: number;
  [key: string]: unknown;
}

export interface DrugRoute {
  id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface DrugDetail {
  /** Drug ID */
  id: string;
  /** National drug code (ma_thuoc_qg) */
  maThuocQg?: string;
  /** Drug name */
  name: string;
  /** Registration number */
  registrationNumber?: string;
  /** Strength */
  strength?: string;
  /** Drug group */
  drugGroupId?: string;
  /** Prescription status: '0' = OTC, '1' = prescription */
  prescriptionStatus?: string;
  /** Special control type */
  specialControlType?: number;
  /** Dosage form (dang_bao_che) */
  dosageForm?: string;
  /** GTIN */
  gtin?: string;
  /** Brand name */
  brandName?: string;
  /** Approval date */
  approvalDate?: string;
  /** Expiry date info */
  expiryDate?: string;
  /** Is prescription drug */
  isPrescriptionDrug?: boolean;
  /** Route of administration */
  route?: DrugRoute;
  /** Manufacturer */
  manufacturer?: DrugManufacturer;
  /** Active ingredients */
  activeIngredients?: DrugActiveIngredient[];
  /** Active pharmaceutical ingredient text */
  activePharmaceuticalIngredient?: string;
  /** Packagings */
  packagings?: DrugPackaging[];
  /** Basic packaging unit ID */
  basicUnitId?: string;
  /** Basic packaging unit name */
  basicUnitName?: string;
  /** Retail packaging unit ID */
  retailUnitId?: string;
  /** Retail packaging unit name */
  retailUnitName?: string;
  /** Conversion rate: basic → retail */
  conversionRate?: number;
  /** Country of manufacture */
  countryOfManufacture?: string;
  /** Raw API response */
  raw?: Record<string, unknown>;
}

// ─── Master data types ───────────────────────────────────────────

export interface MasterUnit {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface MasterRoute {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface MasterCountry {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface MasterDrugGroup {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface MasterManufacturer {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface MasterActiveIngredient {
  id: string;
  name: string;
  [key: string]: unknown;
}

export type DrugSearchResult = PaginatedResponse<DrugSearchItem>;
