// ─── Stock transaction items ─────────────────────────────────────

export interface ManufacturerInfo {
  id?: string;
  name?: string;
}

export interface StockItem {
  drugId: string;
  unitId: string;
  quantity: number;
  batchNo?: string;
  expiryDate?: string;
  price?: number;
  manufacturer?: ManufacturerInfo;
  gtin?: string;
}

// ─── Stock-in ────────────────────────────────────────────────────

export type StockInReason =
  'supplier' | 'return' | 'transfer-in' | 'manufactured' | 'opening-balance' | 'imported';

export interface StockInOptions {
  items: StockItem[];
  reason: StockInReason;
  referenceNumber?: string;
  transactionDate?: string;
  note?: string;
  /** Required when reason = 'supplier' */
  supplierId?: string;
  /** Required when reason = 'transfer-in' */
  sourceStoreId?: string;
  sourceWarehouseId?: string;
  targetStoreId?: string;
  targetWarehouseId?: string;
}

// ─── Stock-out ───────────────────────────────────────────────────

export type StockOutReason = 'sale-retail' | 'return' | 'transfer-out' | 'destroy' | 'other';

export interface StockOutOptions {
  items: StockItem[];
  reason: StockOutReason;
  referenceNumber?: string;
  transactionDate?: string;
  note?: string;
  /** Required when reason = 'return' */
  supplierId?: string;
  /** Required when reason = 'transfer-out' */
  sourceStoreId?: string;
  sourceWarehouseId?: string;
  targetStoreId?: string;
  targetWarehouseId?: string;
}

// ─── Stock-taking ────────────────────────────────────────────────

export interface StockTakingItem {
  drugId: string;
  unitId: string;
  quantity: number;
  batchNo?: string;
  expiryDate?: string;
  price?: number;
  systemQuantity?: number;
  actualQuantity?: number;
  manufacturer?: ManufacturerInfo;
}

export interface StockTakingOptions {
  items: StockTakingItem[];
  transactionDate?: string;
  note?: string;
}

// ─── Transaction result ──────────────────────────────────────────

export interface TransactionResult {
  transactionId: string;
  status?: string;
  /** Number of poll attempts made */
  attempts: number;
  /** True if polling timed out before reaching terminal status */
  timedOut: boolean;
  raw?: Record<string, unknown>;
}

export interface PollResult {
  status: string;
  transactionId: string;
  attempts: number;
  timedOut: boolean;
  messages?: string[];
  raw?: Record<string, unknown>;
}
