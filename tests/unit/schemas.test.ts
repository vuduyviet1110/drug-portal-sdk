import { describe, it, expect } from 'vitest';
import {
  DrugPosItemSchema,
  DrugMasterItemSchema,
  DrugDetailSchema,
  PrescriptionSchema,
  PrescriptionItemSchema,
  TransactionResponseSchema,
  StockInOptionsSchema,
  StockOutOptionsSchema,
  StockTakingOptionsSchema,
} from '../../src/types/schemas';

describe('Drug schemas', () => {
  it('coerces numeric POS id to string', () => {
    const result = DrugPosItemSchema.parse({ id: 42, tenThuoc: 'Paracetamol' });
    expect(result.id).toBe('42');
    expect(result.tenThuoc).toBe('Paracetamol');
  });

  it('accepts master items with passthrough fields', () => {
    const result = DrugMasterItemSchema.parse({
      id: 'D-1',
      soDangKy: 'VD-1',
      extra: true,
    });
    expect(result.id).toBe('D-1');
    expect((result as { extra?: boolean }).extra).toBe(true);
  });

  it('parses drug detail optional fields', () => {
    const result = DrugDetailSchema.parse({
      id: '1',
      tenThuoc: 'A',
      hamLuong: '500mg',
    });
    expect(result.hamLuong).toBe('500mg');
  });
});

describe('Prescription schemas', () => {
  it('coerces prescription item codes and quantities', () => {
    const item = PrescriptionItemSchema.parse({
      ma_thuoc: 99,
      so_luong: '10',
      don_gia: '1500',
    });
    expect(item.ma_thuoc).toBe('99');
    expect(item.so_luong).toBe(10);
    expect(item.don_gia).toBe(1500);
  });

  it('accepts diagnosis as string or array', () => {
    expect(PrescriptionSchema.parse({ chan_doan: 'Sốt' }).chan_doan).toBe('Sốt');
    expect(
      PrescriptionSchema.parse({
        chan_doan: [{ ten_chan_doan: 'Cúm' }],
      }).chan_doan,
    ).toEqual([{ ten_chan_doan: 'Cúm' }]);
  });
});

describe('TransactionResponseSchema', () => {
  it('coerces transactionId to string', () => {
    const result = TransactionResponseSchema.parse({ transactionId: 123, status: 'ok' });
    expect(result.transactionId).toBe('123');
  });
});

describe('Stock option schemas', () => {
  const validItem = {
    drugId: 'DRUG-001',
    unitId: 'U-001',
    quantity: 10,
  };

  it('accepts valid stock-in options', () => {
    expect(() =>
      StockInOptionsSchema.parse({ items: [validItem], reason: 'supplier' }),
    ).not.toThrow();
  });

  it('rejects empty stock-in items', () => {
    expect(() => StockInOptionsSchema.parse({ items: [], reason: 'supplier' })).toThrow();
  });

  it('rejects non-positive quantity', () => {
    expect(() =>
      StockInOptionsSchema.parse({
        items: [{ ...validItem, quantity: 0 }],
        reason: 'supplier',
      }),
    ).toThrow();
  });

  it('rejects invalid stock-in reason', () => {
    expect(() =>
      StockInOptionsSchema.parse({ items: [validItem], reason: 'invalid' }),
    ).toThrow();
  });

  it('accepts valid stock-out options', () => {
    expect(() =>
      StockOutOptionsSchema.parse({ items: [validItem], reason: 'sale-retail' }),
    ).not.toThrow();
  });

  it('rejects negative stock-taking quantity', () => {
    expect(() =>
      StockTakingOptionsSchema.parse({
        items: [{ ...validItem, quantity: -1 }],
      }),
    ).toThrow();
  });

  it('accepts stock-taking with zero quantity', () => {
    expect(() =>
      StockTakingOptionsSchema.parse({
        items: [{ ...validItem, quantity: 0 }],
      }),
    ).not.toThrow();
  });
});
