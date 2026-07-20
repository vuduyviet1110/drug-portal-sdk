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

export const ManufacturerInfoSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
});

export const StockItemSchema = z.object({
  drugId: z.string().min(1, 'drugId is required'),
  unitId: z.string().min(1, 'unitId is required'),
  quantity: z.number().positive('quantity must be positive'),
  batchNo: z.string().optional(),
  expiryDate: z.string().optional(),
  price: z.number().nonnegative('price must be non-negative').optional(),
  manufacturer: ManufacturerInfoSchema.optional(),
  gtin: z.string().optional(),
});

export const StockInOptionsSchema = z
  .object({
    items: z.array(StockItemSchema).min(1, 'items array cannot be empty'),
    reason: z.enum([
      'supplier',
      'return',
      'transfer-in',
      'manufactured',
      'opening-balance',
      'imported',
    ]),
    referenceNumber: z.string().optional(),
    transactionDate: z.string().optional(),
    note: z.string().optional(),
    supplierId: z.string().optional(),
    sourceStoreId: z.string().optional(),
    sourceWarehouseId: z.string().optional(),
    targetStoreId: z.string().optional(),
    targetWarehouseId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.reason === 'supplier' && !data.supplierId) {
        return false;
      }
      return true;
    },
    {
      message: "supplierId is required when reason is 'supplier'",
      path: ['supplierId'],
    },
  )
  .refine(
    (data) => {
      if (data.reason === 'transfer-in' && (!data.sourceStoreId || !data.targetStoreId)) {
        return false;
      }
      return true;
    },
    {
      message: "sourceStoreId and targetStoreId are required when reason is 'transfer-in'",
      path: ['sourceStoreId'],
    },
  );

export const StockOutOptionsSchema = z
  .object({
    items: z.array(StockItemSchema).min(1, 'items array cannot be empty'),
    reason: z.enum(['sale-retail', 'return', 'transfer-out', 'destroy', 'other']),
    referenceNumber: z.string().optional(),
    transactionDate: z.string().optional(),
    note: z.string().optional(),
    supplierId: z.string().optional(),
    sourceStoreId: z.string().optional(),
    sourceWarehouseId: z.string().optional(),
    targetStoreId: z.string().optional(),
    targetWarehouseId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.reason === 'return' && !data.supplierId) {
        return false;
      }
      return true;
    },
    {
      message: "supplierId is required when reason is 'return'",
      path: ['supplierId'],
    },
  )
  .refine(
    (data) => {
      if (data.reason === 'transfer-out' && (!data.sourceStoreId || !data.targetStoreId)) {
        return false;
      }
      return true;
    },
    {
      message: "sourceStoreId and targetStoreId are required when reason is 'transfer-out'",
      path: ['sourceStoreId'],
    },
  );

export const StockTakingItemSchema = z.object({
  drugId: z.string().min(1, 'drugId is required'),
  unitId: z.string().min(1, 'unitId is required'),
  quantity: z.number().nonnegative('quantity must be non-negative'),
  batchNo: z.string().optional(),
  expiryDate: z.string().optional(),
  price: z.number().nonnegative('price must be non-negative').optional(),
  systemQuantity: z.number().nonnegative().optional(),
  actualQuantity: z.number().nonnegative().optional(),
  manufacturer: ManufacturerInfoSchema.optional(),
});

export const StockTakingOptionsSchema = z.object({
  items: z.array(StockTakingItemSchema).min(1, 'items array cannot be empty'),
  transactionDate: z.string().optional(),
  note: z.string().optional(),
});
