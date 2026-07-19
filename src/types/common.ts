/** Paginated API response wrapper */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

/** Generic API response shape */
export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
  headers?: Record<string, string>;
}

/** Transaction status returned by CSDL Dược async endpoints */
export interface TransactionStatus {
  status: string;
  transactionId?: string;
  messages?: string[];
  [key: string]: unknown;
}

/** Pagination options */
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

/** General request options for all SDK methods */
export interface RequestOptions {
  /** Optional trace ID to correlate logs. If not provided, a random UUID will be generated. */
  traceId?: string;
}
