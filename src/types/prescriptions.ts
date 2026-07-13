// ─── Prescription ────────────────────────────────────────────────

export interface PrescriptionDrugItem {
  /** Drug code (ma_thuoc) */
  drugCode?: string;
  /** Drug name */
  drugName?: string;
  /** Unit name */
  unitName?: string;
  /** Prescribed quantity */
  prescribedQuantity?: number;
  /** Usage instruction */
  usageInstruction?: string;
  /** Price */
  price?: number;
  /** Raw item data */
  raw?: Record<string, unknown>;
}

export interface Prescription {
  /** Prescription code (ma_don_thuoc) */
  maDonThuoc: string;
  /** Patient birth date */
  patientBirthDate?: string;
  /** Patient name (ho_ten_benh_nhan) */
  patientName?: string;
  /** Patient health ID (ma_dinh_danh_y_te) */
  patientHealthId?: string;
  /** Diagnosis (chan_doan) */
  diagnosis?: string;
  /** Doctor name (ten_bac_si) */
  doctorName?: string;
  /** Facility name (ten_co_so_kham) */
  facilityName?: string;
  /** Drug items in the prescription */
  items: PrescriptionDrugItem[];
  /** Raw API response */
  raw?: Record<string, unknown>;
}

// ─── Update sale quantity ────────────────────────────────────────

export interface PrescriptionSaleItem {
  drugId?: string;
  drugName?: string;
  unitName?: string;
  prescribedQuantity?: number;
  soldQuantity: number;
  usageInstruction?: string;
}

export interface PrescriptionUpdateOptions {
  maDonThuoc: string;
  items: PrescriptionSaleItem[];
  /** Pharmacy identifier / name */
  pharmacyName?: string;
  /** Pharmacy phone */
  pharmacyPhone?: string;
  /** Pharmacy address */
  pharmacyAddress?: string;
  /** Invoice number */
  invoiceNumber?: string;
}

export interface PrescriptionUpdateResult {
  success: boolean;
  status: number;
  data?: Record<string, unknown>;
  error?: string;
}
