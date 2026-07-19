import { HttpClient } from '../http/http-client.js';
import type {
  StockInOptions,
  StockOutOptions,
  StockTakingOptions,
  TransactionResult,
} from '../types/inventory.js';
import type { RequestOptions } from '../types/common.js';
import type { Logger } from '../http/logger.js';
import {
  CSDL_DUOC_ENDPOINTS,
  TERMINAL_STATUSES,
  SUCCESS_STATUS,
  POLL_MAX_ATTEMPTS,
  POLL_ACCEPTED_DELAY_MS,
  POLL_PROCESSING_DELAY_MS,
  POLL_MAX_ERROR_RETRIES,
  POLL_ERROR_RETRY_DELAY_MS,
} from '../constants.js';
import type { ManufacturerInfo, StockItem } from '../types/inventory.js';
import { generateTraceId } from '../http/logger.js';

/** Transaction type used in polling */
type TransactionType = 'stock-in' | 'stock-out' | 'stock-taking';

/**
 * Inventory operations for CSDL Dược.
 *
 * Ported from Python:
 * - `CsdlDuocPayloadBuilder` (helpers/csdlduoc_payload.py)
 * - `StockReasonMapper` (helpers/stock_reason.py)
 * - `poll_until_terminal()` (helpers/async_polling.py)
 * - `CsdlDuocService.sync_stock_in/out/taking()`, `_sync_picking()`, `_poll_transaction_status()`
 */
export class InventoryClient {
  private readonly http: HttpClient;
  private readonly logger: Logger;
  private readonly storeId?: string;
  private readonly warehouseCode?: string;

  constructor(
    http: HttpClient,
    logger: Logger,
    opts: { storeId?: string; warehouseCode?: string } = {},
  ) {
    this.http = http;
    this.logger = logger;
    this.storeId = opts.storeId;
    this.warehouseCode = opts.warehouseCode;
  }

  /**
   * Submit stock-in transaction (nhập kho).
   *
   * POST /transactions/stock-in → returns transaction_id → auto-polls until terminal.
   */
  async stockIn(opts: StockInOptions, apiOpts?: RequestOptions): Promise<TransactionResult> {
    const resolvedOpts = { traceId: apiOpts?.traceId ?? generateTraceId(), ...apiOpts };
    const txId = await this.postTransaction(CSDL_DUOC_ENDPOINTS.STOCK_IN, opts, 'stock-in', resolvedOpts);
    return this.pollTransaction('stock-in', txId, resolvedOpts);
  }

  /**
   * Submit stock-out transaction (xuất kho).
   *
   * POST /transactions/stock-out → returns transaction_id → auto-polls until terminal.
   */
  async stockOut(opts: StockOutOptions, apiOpts?: RequestOptions): Promise<TransactionResult> {
    const resolvedOpts = { traceId: apiOpts?.traceId ?? generateTraceId(), ...apiOpts };
    const txId = await this.postTransaction(CSDL_DUOC_ENDPOINTS.STOCK_OUT, opts, 'stock-out', resolvedOpts);
    return this.pollTransaction('stock-out', txId, resolvedOpts);
  }

  /**
   * Submit stock-taking transaction (kiểm kho).
   *
   * POST /transactions/stock-taking → returns transaction_id → auto-polls until terminal.
   */
  async stockTaking(opts: StockTakingOptions, apiOpts?: RequestOptions): Promise<TransactionResult> {
    const resolvedOpts = { traceId: apiOpts?.traceId ?? generateTraceId(), ...apiOpts };
    const txId = await this.postTransaction(CSDL_DUOC_ENDPOINTS.STOCK_TAKING, opts, 'stock-taking', resolvedOpts);
    return this.pollTransaction('stock-taking', txId, resolvedOpts);
  }

  async pollTransaction(
    type: TransactionType,
    transactionId: string,
    apiOpts?: RequestOptions,
  ): Promise<TransactionResult> {
    const endpoint = `/transactions/${type}/${transactionId}/status`;
    let attempts = 0;
    let errorRetries = 0;
    const traceId = apiOpts?.traceId;

    while (attempts < POLL_MAX_ATTEMPTS) {
      attempts++;
      try {
        const statusObj = await this.http.get<Record<string, unknown>>(endpoint, { traceId });
        const rawStatus = (statusObj['status'] ?? statusObj['status_code'] ?? '') as string;
        const statusCode = rawStatus.toLowerCase();

        this.logger.debug(`Poll attempt ${attempts}: status=${rawStatus}`, {
          transactionId,
          type,
          traceId,
        });

        if (TERMINAL_STATUSES.includes(statusCode as (typeof TERMINAL_STATUSES)[number])) {
          const timedOut = false;
          const result = {
            transactionId,
            status: statusCode,
            raw: statusObj,
          } as TransactionResult & { timedOut: boolean; attempts: number };

          if (statusCode === SUCCESS_STATUS) {
            this.logger.info(`Transaction completed successfully`, { transactionId, attempts, traceId });
          } else {
            this.logger.warn(`Transaction ${statusCode}`, {
              transactionId,
              status: statusObj,
              attempts,
              traceId,
            });
          }

          return { ...result, timedOut, attempts };
        }

        // Determine next wait
        if (statusCode === 'accepted') {
          await sleep(POLL_ACCEPTED_DELAY_MS);
        } else if (statusCode === 'processing') {
          await sleep(POLL_PROCESSING_DELAY_MS);
        } else {
          // Unknown non-terminal status → poll again after short delay
          await sleep(POLL_ACCEPTED_DELAY_MS);
        }
      } catch (err) {
        this.logger.warn(`Poll error on attempt ${attempts}: ${(err as Error).message}`, { traceId });
        errorRetries++;
        if (errorRetries > POLL_MAX_ERROR_RETRIES) {
          return {
            transactionId,
            status: 'error',
            raw: { messages: ['Polling error after max error retries'] },
            timedOut: false,
            attempts,
          };
        }
        await sleep(POLL_ERROR_RETRY_DELAY_MS);
      }
    }

    return {
      transactionId,
      status: 'error',
      raw: { messages: ['Polling timeout'] },
      timedOut: true,
      attempts,
    };
  }

  // ─── Internal: Build payload and POST ───────────────────────

  private async postTransaction(
    endpoint: string,
    opts: StockInOptions | StockOutOptions | StockTakingOptions,
    type: 'stock-in' | 'stock-out' | 'stock-taking',
    apiOpts?: RequestOptions,
  ): Promise<string> {
    const payload = this.buildPayload(opts, type);
    const traceId = apiOpts?.traceId;
    const data = await this.http.post<Record<string, unknown>>(endpoint, payload, { traceId });
    const txId = (data['transaction_id'] ?? data['id'] ?? '') as string;
    this.logger.info(`Transaction submitted: ${txId}`, { type, traceId });
    return txId;
  }

  private buildPayload(
    opts: StockInOptions | StockOutOptions | StockTakingOptions,
    type: 'stock-in' | 'stock-out' | 'stock-taking',
  ): Record<string, unknown> {
    const items = 'items' in opts ? opts.items.map(mapStockItem) : [];
    const reason =
      type === 'stock-in' || type === 'stock-out'
        ? mapReason((opts as StockInOptions | StockOutOptions).reason as string, type)
        : undefined;

    const payload: Record<string, unknown> = {
      store_id: this.storeId,
      items,
      transaction_date:
        'transactionDate' in opts && opts.transactionDate
          ? opts.transactionDate
          : formatDateTime(new Date()),
    };

    if (this.warehouseCode) {
      payload['warehouse_code'] = this.warehouseCode;
    }
    if (reason) payload['reason'] = reason;
    if ('referenceNumber' in opts && opts.referenceNumber)
      payload['reference_number'] = opts.referenceNumber;
    if ('note' in opts && opts.note) payload['note'] = opts.note;

    // Stock-in: reason-specific fields
    if (type === 'stock-in') {
      const si = opts as StockInOptions;
      if (si.reason === 'supplier' && si.supplierId) {
        payload['supplier_id'] = si.supplierId;
      }
      if (si.reason === 'transfer-in') {
        if (si.sourceStoreId) payload['source_store_id'] = si.sourceStoreId;
        if (si.sourceWarehouseId) payload['source_warehouse_id'] = si.sourceWarehouseId;
        if (si.targetStoreId) payload['target_store_id'] = si.targetStoreId;
        if (si.targetWarehouseId) payload['target_warehouse_id'] = si.targetWarehouseId;
      }
    }

    // Stock-out: reason-specific fields
    if (type === 'stock-out') {
      const so = opts as StockOutOptions;
      if (so.reason === 'return' && so.supplierId) {
        payload['supplier_id'] = so.supplierId;
      }
      if (so.reason === 'transfer-out') {
        if (so.sourceStoreId) payload['source_store_id'] = so.sourceStoreId;
        if (so.sourceWarehouseId) payload['source_warehouse_id'] = so.sourceWarehouseId;
        if (so.targetStoreId) payload['target_store_id'] = so.targetStoreId;
        if (so.targetWarehouseId) payload['target_warehouse_id'] = so.targetWarehouseId;
      }
    }

    return payload;
  }
}

// ─── Payload builders ────────────────────────────────────────────

/**
 * Port of Python `StockReasonMapper.get_stock_in_reason()` / `get_stock_out_reason()`
 * from helpers/stock_reason.py.
 *
 * Maps internal reason strings to QĐ 522 API reason codes.
 */
function mapReason(reason: string, type: 'stock-in' | 'stock-out'): string {
  // Validate reason against allowed values
  if (type === 'stock-in') {
    const allowed = [
      'supplier',
      'return',
      'transfer-in',
      'manufactured',
      'opening-balance',
      'imported',
    ];
    if (!allowed.includes(reason)) {
      throw new Error(`Invalid stock-in reason: ${reason}. Must be one of: ${allowed.join(', ')}`);
    }
    return reason;
  }
  if (type === 'stock-out') {
    const allowed = ['sale-retail', 'return', 'transfer-out', 'destroy', 'other'];
    if (!allowed.includes(reason)) {
      throw new Error(`Invalid stock-out reason: ${reason}. Must be one of: ${allowed.join(', ')}`);
    }
    return reason;
  }
  return reason;
}

/**
 * Map a single stock item to API payload shape.
 * Port of `CsdlDuocPayloadBuilder._build_picking_transaction_items()`.
 */
function mapStockItem(item: StockItem): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    drug_id: item.drugId,
    unit_id: item.unitId,
    quantity: item.quantity,
  };

  if (item.batchNo) payload['batch_no'] = item.batchNo;
  if (item.expiryDate) payload['expiry_date'] = formatExpiryDate(item.expiryDate);
  if (item.price !== undefined) payload['price'] = item.price;
  if (item.gtin) payload['gtin'] = item.gtin;

  if (item.manufacturer) {
    const m = item.manufacturer as ManufacturerInfo & Record<string, unknown>;
    payload['manufacturer'] = {
      id: m.id,
      name: m.name,
    };
  }

  return payload;
}

/**
 * Format datetime to `YYYY-MM-DDTHH:MM:SS+07:00`.
 * Port of `CsdlDuocPayloadBuilder._format_datetime()`.
 *
 * Important: Python outputs +07:00 (Vietnam timezone).
 * TS `toISOString()` outputs UTC `Z`. Custom formatter required.
 */
function formatDateTime(date: Date): string {
  // Offset to UTC+7
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60_000 + 7 * 3600_000;
  const d = new Date(utcMs);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+07:00`;
}

/** Format expiry date — may be YYYY-MM-DD or Date string */
function formatExpiryDate(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value; // already a string, pass through
  return formatDateTime(d);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
