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

  // TÔN TRỌNG SERVER ĐANG QUÁ TẢI (429):
  // Nếu Cục Dược bảo "Too Many Requests" và trả về Header 'Retry-After', SDK sẽ đứng yên
  // đúng bằng số giây mà Server yêu cầu để tránh làm sập thêm Server.
  if (status === 429 && response) {
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter) {
      const parsed = parseInt(retryAfter, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return Math.min(parsed * 1000, maxDelay);
      }
    }
    return baseDelay;
  }

  // EXPONENTIAL BACKOFF & JITTER (ĐỨT MẠNG HOẶC LỖI 500):
  // 1. Cấp số nhân (Exponential): Thử lại lần 1 chờ 5s, lần 2 chờ 10s, lần 3 chờ 20s. Càng lỗi chờ càng lâu.
  // 2. Chống dội bom (Jitter): Cộng thêm một số mili-giây ngẫu nhiên (0 -> 1s) vào thời gian chờ.
  // Nhờ đó, nếu có 1000 người dùng SDK bị rớt mạng cùng lúc, họ sẽ thử lại ở các mốc rải rác: 5.1s, 5.8s, 5.3s...
  // thay vì đồng loạt gửi 1000 request vào đúng giây thứ 5 khiến Server chết tức tưởi lần 2.
  const exponential = baseDelay * Math.pow(2, Math.min(attempt, 5));
  const jitter = Math.random() * 1000; // up to 1s jitter
  return Math.min(exponential + jitter, maxDelay);
}
