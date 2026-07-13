/** Retry configuration options */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in milliseconds between retries (default: 5000) */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** HTTP timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

/** Determines if a response status code should trigger a retry */
export function shouldRetry(status: number, retryOpts?: RetryOptions): boolean {
  const maxRetries = retryOpts?.maxRetries ?? 3;
  if (maxRetries <= 0) return false;

  // 429 Too Many Requests — retry
  if (status === 429) return true;
  // 5xx Server Errors — retry
  if (status >= 500 && status < 600) return true;
  return false;
}

/**
 * Calculate the delay before the next retry.
 * For 429: reads Retry-After header if present.
 * For others: exponential backoff with jitter.
 */
export function getRetryDelay(
  attempt: number,
  status: number,
  response?: Response,
  retryOpts?: RetryOptions,
): number {
  const baseDelay = retryOpts?.baseDelayMs ?? 5_000;
  const maxDelay = retryOpts?.maxDelayMs ?? 30_000;

  // 429: check Retry-After header
  if (status === 429 && response) {
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter) {
      const parsed = parseInt(retryAfter, 10);
      if (!isNaN(parsed) && parsed > 0) {
        // Could be seconds or absolute timestamp; treat as seconds
        return Math.min(parsed * 1000, maxDelay);
      }
    }
    return baseDelay; // fallback
  }

  // Exponential backoff: baseDelay * 2^attempt + random jitter
  const exponential = baseDelay * Math.pow(2, Math.min(attempt, 5));
  const jitter = Math.random() * 1000; // up to 1s jitter
  return Math.min(exponential + jitter, maxDelay);
}
