import { describe, it, expect } from 'vitest';
import '../helpers/mock-handlers';
import { DrugPortalClient } from '../../src/index';

describe('Prescription lookup (QĐ 228)', () => {
  const client = new DrugPortalClient({
    environment: 'sandbox',
    qd228: { appName: 'test-app', appKey: 'test-key' },
  });

  it('looks up prescription by code', async () => {
    const rx = await client.qd228!.prescriptions.get('DH001');

    expect(rx.maDonThuoc).toBe('DH001');
    expect(rx.patientBirthDate).toBe('1990-01-01');
    expect(rx.diagnosis).toBe('Sốt');
    expect(rx.doctorName).toBe('BS Nguyễn Văn A');
    expect(rx.items).toHaveLength(1);
    expect(rx.items[0]?.drugName).toBe('Paracetamol 500mg');
    expect(rx.items[0]?.prescribedQuantity).toBe(10);
    expect(rx.items[0]?.usageInstruction).toBe('Uống cách 4-6h');
  });

  it('updates prescription sale quantity', async () => {
    const result = await client.qd228!.prescriptions.updateSaleQty({
      maDonThuoc: 'DH001',
      items: [
        {
          drugId: 'DRUG-001',
          drugName: 'Paracetamol 500mg',
          unitName: 'Viên',
          soldQuantity: 10,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
  });
});
