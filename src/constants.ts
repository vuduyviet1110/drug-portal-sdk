// ─── Environment ─────────────────────────────────────────────────

export type Environment = 'sandbox' | 'production';

// ─── Base URLs ───────────────────────────────────────────────────

export const CSDL_DUOC_SANDBOX_URL = 'https://api-sandbox.csdlduoc.com.vn/v2';
export const CSDL_DUOC_PRODUCTION_URL = 'https://api.csdlduoc.com.vn/v2';
export const NATIONAL_RX_BASE_URL = 'https://donthuocquocgia.vn';

// ─── API Endpoints ───────────────────────────────────────────────

export const CSDL_DUOC_ENDPOINTS = {
  AUTH_LOGIN: '/auth/login',
  // Master data
  MASTER_DRUGS: '/master/drugs',
  MASTER_UNITS: '/master/units',
  MASTER_ROUTES: '/master/routes',
  MASTER_COUNTRIES: '/master/countries',
  MASTER_DRUG_GROUPS: '/master/drug-groups',
  MASTER_ACTIVE_INGREDIENTS: '/master/active-ingredients',
  MASTER_MANUFACTURERS: '/master/manufactures',
  MASTER_PROVINCES: '/master/provinces',
  MASTER_COMMUNES: '/master/communes',
  // POS portal (different base URL — strips /v2)
  POS_PRODUCT_GET_PAGED: '/api/pos/product/get-paged',
  // Inventory transactions
  STOCK_IN: '/transactions/stock-in',
  STOCK_OUT: '/transactions/stock-out',
  STOCK_TAKING: '/transactions/stock-taking',
  // Inventory reports
  REPORT_MONTHLY: '/inventory-reports/monthly',
  REPORT_QUARTERLY: '/inventory-reports/quarterly',
  REPORT_YEARLY: '/inventory-reports/yearly',
  REPORT_PERIOD_STATUS: '/inventory-reports/period/status',
} as const;

export const NATIONAL_RX_ENDPOINTS = {
  PRESCRIPTION_INFO: '/api/v1/thong-tin-don-thuoc',
  UPDATE_PRESCRIPTION: '/api/v1/cap-nhat-don-thuoc',
} as const;

// ─── Retry defaults ──────────────────────────────────────────────

export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_DELAY_MS = 5_000;
export const DEFAULT_API_TIMEOUT_MS = 30_000;
export const DEFAULT_TOKEN_TTL_HOURS = 23;
export const TOKEN_REFRESH_MINUTES = 5;

// ─── Polling defaults ────────────────────────────────────────────

export const POLL_ACCEPTED_DELAY_MS = 5_000;
export const POLL_PROCESSING_DELAY_MS = 10_000;
export const POLL_ERROR_RETRY_DELAY_MS = 60_000;
export const POLL_MAX_ERROR_RETRIES = 3;
export const POLL_MAX_ATTEMPTS = 30;
export const TERMINAL_STATUSES = ['completed', 'rejected', 'error'] as const;
export const SUCCESS_STATUS = 'completed';

// ─── QĐ 228 retry ───────────────────────────────────────────────

export const QD228_MAX_RETRIES = 2;
export const QD228_RETRY_DELAY_MS = 30_000;

// ─── Logging ────────────────────────────────────────────────────

export const API_LOG_BODY_MAX = 10_000;
