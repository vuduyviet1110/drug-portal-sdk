import { PrescriptionClient } from './prescriptions.js';
import type { HttpClient } from '../http/http-client.js';
import type { Logger } from '../http/logger.js';

/**
 * Aggregated QĐ 228 (Cổng Đơn Thuốc Quốc Gia) client.
 *
 * Currently groups only prescriptions sub-client.
 * Extensible for future UCs (e.g. inventory reports via QĐ 228).
 */
export class Qd228Client {
  readonly prescriptions: PrescriptionClient;

  constructor(http: HttpClient, logger: Logger) {
    this.prescriptions = new PrescriptionClient(http, logger);
  }
}
