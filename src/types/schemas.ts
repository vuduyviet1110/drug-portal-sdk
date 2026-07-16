import { z } from 'zod';

/** Schema validation for a drug item in POS catalog list */
export const DrugPosItemSchema = z
  .object({
    id: z
      .string()
      .or(z.number())
      .transform((val) => String(val)),
    tenThuoc: z.string().optional().nullable(),
    soDangKy: z.string().optional().nullable(),
  })
  .passthrough();

/** Schema validation for a drug item in Master catalog list */
export const DrugMasterItemSchema = z
  .object({
    id: z
      .string()
      .or(z.number())
      .transform((val) => String(val)),
    tenThuoc: z.string().optional().nullable(),
    soDangKy: z.string().optional().nullable(),
  })
  .passthrough();

/** Schema validation for a drug detail */
export const DrugDetailSchema = z
  .object({
    id: z
      .string()
      .or(z.number())
      .transform((val) => String(val)),
    tenThuoc: z.string().optional().nullable(),
    soDangKy: z.string().optional().nullable(),
    hamLuong: z.string().optional().nullable(),
    hangSanXuat: z.string().optional().nullable(),
    nuocSanXuat: z.string().optional().nullable(),
    quyCachDongGoi: z.string().optional().nullable(),
  })
  .passthrough();

/** Schema validation for prescription items (QĐ 228) */
export const PrescriptionItemSchema = z
  .object({
    ma_thuoc: z
      .string()
      .or(z.number())
      .optional()
      .nullable()
      .transform((val) => (val !== undefined && val !== null ? String(val) : undefined)),
    ten_thuoc: z.string().optional().nullable(),
    don_vi: z.string().optional().nullable(),
    so_luong: z.number().or(z.string().transform(Number)).optional().nullable(),
    cach_dung: z.string().optional().nullable(),
    don_gia: z.number().or(z.string().transform(Number)).optional().nullable(),
  })
  .passthrough();

/** Schema validation for prescription details (QĐ 228) */
export const PrescriptionSchema = z
  .object({
    ngay_sinh_benh_nhan: z.string().optional().nullable(),
    ho_ten_benh_nhan: z.string().optional().nullable(),
    ma_dinh_danh_y_te: z.string().optional().nullable(),
    chan_doan: z
      .union([z.string(), z.array(z.any())])
      .optional()
      .nullable(),
    ten_bac_si: z.string().optional().nullable(),
    ten_co_so_kham: z.string().optional().nullable(),
    ten_co_so_kham_chua_benh: z.string().optional().nullable(),
    thong_tin_don_thuoc: z.array(PrescriptionItemSchema).optional(),
    items: z.array(PrescriptionItemSchema).optional(),
  })
  .passthrough();

/** Schema validation for transaction creation response */
export const TransactionResponseSchema = z
  .object({
    transactionId: z
      .string()
      .or(z.number())
      .transform((val) => String(val)),
    status: z.string().optional(),
  })
  .passthrough();
