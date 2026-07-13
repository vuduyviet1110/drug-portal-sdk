/** Logger interface for SDK structured logging */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/** Built-in structured logger that outputs JSON lines */
export class StructuredLogger implements Logger {
  private readonly prefix: string;
  private readonly delegate?: Logger;

  constructor(prefix: string, delegate?: Logger) {
    this.prefix = prefix;
    this.delegate = delegate;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write('DEBUG', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write('INFO', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write('WARN', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write('ERROR', message, meta);
  }

  private write(level: string, message: string, meta?: Record<string, unknown>): void {
    // Delegate if provided
    if (this.delegate) {
      this.delegate[level.toLowerCase() as keyof Logger]?.(message, meta);
    }
    // Always write JSON to stdout (grep-friendly)
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      source: this.prefix,
      message,
      ...meta,
    };
    console.log(JSON.stringify(entry));
  }
}

/** Generate a unique trace ID for each request */
export function generateTraceId(): string {
  // Simple: use crypto random if available, fallback to timestamp+random
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 8);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
