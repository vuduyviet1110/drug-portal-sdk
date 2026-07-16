import { HttpClient } from '../http/http-client.js';
import type {
  Prescription,
  PrescriptionUpdateOptions,
  PrescriptionUpdateResult,
} from '../types/prescriptions.js';
import type { Logger } from '../http/logger.js';
import { NATIONAL_RX_ENDPOINTS, QD228_RETRY_DELAY_MS, QD228_MAX_RETRIES } from '../constants.js';
import { PrescriptionSchema } from '../types/schemas.js';

/**
 * QĐ 228 (Cổng Đơn Thuốc Quốc Gia) prescription operations.
 *
 * Ported from Python:
 * - `NationalRxService.lookup_prescription()` (qd228-service.py:122)
 * - `NationalRxService.update_prescription_sale_qty()` (qd228-service.py:350-477)
 *
 * Auth: static app-name/app-key headers (no OAuth).
 * Retry: max 2 retries with 30s delay for updatePrescriptionSaleQty.
 */
export class PrescriptionClient {
  private readonly http: HttpClient;
  private readonly logger: Logger;

  constructor(http: HttpClient, logger: Logger) {
    this.http = http;
    this.logger = logger;
  }

  /**
   * Look up a prescription by code.
   *
   * GET /api/v1/thong-tin-don-thuoc/{maDonThuoc}
   */
  async get(maDonThuoc: string): Promise<Prescription> {
    const url = `${NATIONAL_RX_ENDPOINTS.PRESCRIPTION_INFO}/${encodeURIComponent(maDonThuoc)}`;
    const data = await this.http.get<Record<string, unknown>>(url);
    return mapPrescription(maDonThuoc, data);
  }

  /**
   * Update prescription sale quantity (UC05).
   *
   * POST /api/v1/cap-nhat-don-thuoc
   *
   * Retries up to QD228_MAX_RETRIES (2) times with QD228_RETRY_DELAY_MS (30s) delay.
   * Ported from `NationalRxService.update_prescription_sale_qty()` lines 411-477.
   */
  async updateSaleQty(opts: PrescriptionUpdateOptions): Promise<PrescriptionUpdateResult> {
    const payload = buildPrescriptionUpdatePayload(opts);

    let lastError: Error | undefined;
    let status = 0;
    let data: Record<string, unknown> | undefined;

    for (let attempt = 0; attempt <= QD228_MAX_RETRIES; attempt++) {
      try {
        const result = await this.http.post<Record<string, unknown>>(
          NATIONAL_RX_ENDPOINTS.UPDATE_PRESCRIPTION,
          payload,
        );

        status = 200;
        data = result;
        this.logger.info('Prescription sale quantity updated', {
          maDonThuoc: opts.maDonThuoc,
          attempt: attempt + 1,
        });
        return { success: true, status, data };
      } catch (err) {
        this.logger.warn(
          `Prescription sale qty update failed (attempt ${attempt + 1}/${QD228_MAX_RETRIES + 1}): ${(err as Error).message}`,
        );
        lastError = err as Error;

        if (err instanceof Error && 'status' in err) {
          status = (err as { status?: number }).status ?? 0;
        }

        if (attempt < QD228_MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, QD228_RETRY_DELAY_MS));
        }
      }
    }

    this.logger.error('Prescription sale qty update failed after all retries', {
      maDonThuoc: opts.maDonThuoc,
      error: lastError?.message,
    });

    return {
      success: false,
      status,
      error: lastError?.message ?? 'Update failed after retries',
    };
  }
}

// ─── Response parser ─────────────────────────────────────────────

function mapPrescription(maDonThuoc: string, data: Record<string, unknown>): Prescription {
  const parsed = PrescriptionSchema.safeParse(data);
  const rxData = parsed.success ? parsed.data : ({} as any);

  const rxItems = (rxData.thong_tin_don_thuoc ??
    rxData.items ??
    data['thong_tin_don_thuoc'] ??
    data['items'] ??
    []) as Array<Record<string, unknown>>;

  let diagnosisStr = '';
  const rawDiagnosis = rxData.chan_doan ?? data['chan_doan'];
  if (Array.isArray(rawDiagnosis)) {
    diagnosisStr = rawDiagnosis
      .map((c) => {
        if (typeof c === 'object' && c !== null) {
          const ten = (c as Record<string, unknown>)['ten_chan_doan'];
          const ma = (c as Record<string, unknown>)['ma_chan_doan'];
          return ten || ma || '';
        }
        return String(c);
      })
      .filter(Boolean)
      .join(', ');
  } else if (rawDiagnosis) {
    diagnosisStr = String(rawDiagnosis);
  }

  return {
    maDonThuoc,
    patientBirthDate: (rxData.ngay_sinh_benh_nhan ?? data['ngay_sinh_benh_nhan']) as
      string | undefined,
    patientName: (rxData.ho_ten_benh_nhan ?? data['ho_ten_benh_nhan']) as string | undefined,
    patientHealthId: (rxData.ma_dinh_danh_y_te ?? data['ma_dinh_danh_y_te']) as string | undefined,
    diagnosis: diagnosisStr || undefined,
    doctorName: (rxData.ten_bac_si ?? data['ten_bac_si']) as string | undefined,
    facilityName: (rxData.ten_co_so_kham_chua_benh ??
      rxData.ten_co_so_kham ??
      data['ten_co_so_kham_chua_benh'] ??
      data['ten_co_so_kham']) as string | undefined,
    items: rxItems.map((item) => {
      const rawQty =
        item['so_luong'] ?? item['so_luong_to'] ?? item['prescribed_quantity'] ?? item['quantity'];
      const parsedQty = rawQty !== undefined && rawQty !== null ? Number(rawQty) : undefined;

      return {
        drugCode: (item['ma_thuoc'] ?? item['drug_code'] ?? item['ma_thuoc_qg']) as
          string | undefined,
        drugName: (item['ten_thuoc'] ?? item['drug_name'] ?? item['name'] ?? item['biet_duoc']) as
          string | undefined,
        unitName: (item['don_vi_tinh'] ?? item['don_vi'] ?? item['unit_name']) as
          string | undefined,
        prescribedQuantity: parsedQty && !isNaN(parsedQty) ? parsedQty : undefined,
        usageInstruction: (item['cach_dung'] ?? item['usage_instruction']) as string | undefined,
        price: item['don_gia'] as number | undefined,
        raw: item,
      };
    }),
    raw: data,
  };
}

// ─── Payload builder ─────────────────────────────────────────────

function buildPrescriptionUpdatePayload(opts: PrescriptionUpdateOptions): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ma_don_thuoc: opts.maDonThuoc,
    thong_tin_thuoc: opts.items.map((item) => ({
      ma_thuoc: item.drugId,
      ten_thuoc: item.drugName,
      don_vi: item.unitName,
      so_luong_to: item.prescribedQuantity,
      so_luong_ban: item.soldQuantity,
      cach_dung: item.usageInstruction,
    })),
  };

  if (opts.pharmacyName) payload['co_so_kham'] = opts.pharmacyName;
  if (opts.pharmacyPhone) payload['so_dien_thoai'] = opts.pharmacyPhone;
  if (opts.pharmacyAddress) payload['dia_chi'] = opts.pharmacyAddress;
  if (opts.invoiceNumber) payload['so_hoa_don'] = opts.invoiceNumber;

  return payload;
}
