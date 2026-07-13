import { API_LOG_BODY_MAX } from '../constants.js';

/** Secret field names that must be masked in logs */
const SECRET_FIELDS = new Set(['password', 'token', 'access_token', 'appKey', 'app-key']);

/**
 * Mask sensitive fields in a log payload.
 * Recursively replaces values of known secret fields with '***'.
 */
export function maskSecrets<T = unknown>(data: T): T {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') return data as T;
  if (typeof data === 'number' || typeof data === 'boolean') return data as T;

  if (Array.isArray(data)) {
    return data.map(maskSecrets) as T;
  }

  if (typeof data === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SECRET_FIELDS.has(key.toLowerCase())) {
        masked[key] = '***';
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = maskSecrets(value);
      } else {
        masked[key] = value;
      }
    }
    return masked as T;
  }

  return data as T;
}

/**
 * Truncate long body strings for log output.
 */
export function truncateLogBody(body: string): string {
  if (body.length <= API_LOG_BODY_MAX) return body;
  return `${body.slice(0, API_LOG_BODY_MAX)}... [truncated, total ${body.length} chars]`;
}
