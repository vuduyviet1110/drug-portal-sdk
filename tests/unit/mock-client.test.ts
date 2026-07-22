import { describe, it, expect } from 'vitest';
import { MockDrugPortalClient, DrugPortalClient } from '../../src/index';

describe('MockDrugPortalClient', () => {
  it('filters mock drugs by keyword', async () => {
    const client = new MockDrugPortalClient();
    const result = await client.csdlDuoc.drugs.search('para');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.name).toContain('Paracetamol');
  });

  it('returns drug detail from mock store', async () => {
    const client = new MockDrugPortalClient();
    const detail = await client.csdlDuoc.drugs.getDetail('1');
    expect(detail.id).toBe('1');
    expect(detail.name).toBe('Paracetamol 500mg');
  });

  it('throws when mock drug id is missing', async () => {
    const client = new MockDrugPortalClient();
    await expect(client.csdlDuoc.drugs.getDetail('missing')).rejects.toThrow(/not found/);
  });

  it('returns mock stock-in and stock-out results', async () => {
    const client = new MockDrugPortalClient();
    const stockIn = await client.csdlDuoc.inventory.stockIn({
      items: [{ drugId: '1', unitId: 'U-1', quantity: 1 }],
      reason: 'supplier',
    });
    const stockOut = await client.csdlDuoc.inventory.stockOut({
      items: [{ drugId: '1', unitId: 'U-1', quantity: 1 }],
      reason: 'sale-retail',
    });

    expect(stockIn.status).toBe('completed');
    expect(stockIn.transactionId).toContain('tx-mock-in-');
    expect(stockOut.status).toBe('completed');
    expect(stockOut.transactionId).toContain('tx-mock-out-');
  });

  it('looks up and updates mock prescriptions', async () => {
    const client = new MockDrugPortalClient();
    const rx = await client.qd228!.prescriptions.get('DT-001');
    expect(rx.patientName).toBe('Nguyen Van A');

    const update = await client.qd228!.prescriptions.updateSaleQty({
      maDonThuoc: 'DT-001',
      items: [{ drugId: '1', drugName: 'Para', unitName: 'Viên', soldQuantity: 1 }],
    });
    expect(update.success).toBe(true);
  });

  it('throws when mock prescription is missing', async () => {
    const client = new MockDrugPortalClient();
    await expect(client.qd228!.prescriptions.get('NOPE')).rejects.toThrow(/not found/);
  });
});

describe('DrugPortalClient useMock mode', () => {
  it('auto-fills dummy credentials and intercepts API calls', async () => {
    const client = new DrugPortalClient({
      environment: 'sandbox',
      useMock: true,
    });

    expect(client.csdlDuoc).toBeDefined();
    expect(client.qd228).toBeDefined();

    const drugs = await client.csdlDuoc.drugs.search('ibuprofen');
    expect(drugs.items).toHaveLength(1);
    expect(drugs.items[0]?.name).toContain('Mock');

    const detail = await client.csdlDuoc.drugs.getDetail('99');
    expect(detail.name).toBe('Mock Drug Detail');

    const rx = await client.qd228!.prescriptions.get('RX-1');
    expect(rx.maDonThuoc).toBe('RX-1');
    expect(rx.patientName).toContain('Mock');
  });

  it('returns mock inventory results when useMock is enabled', async () => {
    const client = new DrugPortalClient({
      environment: 'sandbox',
      useMock: true,
      csdlDuoc: { username: 'u', password: 'p' },
    });

    const result = await client.csdlDuoc.inventory.stockTaking({
      items: [{ drugId: '1', unitId: 'U-1', quantity: 0 }],
    });
    expect(result.transactionId).toContain('tx-mock-take-');
    expect(result.status).toBe('completed');
  });
});
