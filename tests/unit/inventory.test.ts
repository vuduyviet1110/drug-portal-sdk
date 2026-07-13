import { describe, it, expect } from 'vitest';
import '../helpers/mock-handlers';
import { DrugPortalClient } from '../../src/index';

describe('Inventory — stock-in', () => {
  const client = new DrugPortalClient({
    environment: 'sandbox',
    csdlDuoc: {
      username: 'test',
      password: 'test',
      storeId: 'STORE-001',
      warehouseCode: 'WH-001',
    },
  });

  it('submits stock-in and polls until completed', async () => {
    const result = await client.csdlDuoc.inventory.stockIn({
      items: [
        {
          drugId: 'DRUG-001',
          unitId: 'U-001',
          quantity: 100,
          batchNo: 'LOT-2024-001',
          expiryDate: '2025-12-31',
          price: 5000,
          manufacturer: { id: 'M-001', name: 'Pharma Corp' },
        },
      ],
      reason: 'supplier',
      referenceNumber: 'PO-2024-001',
    });

    expect(result.transactionId).toBe('TX-STOCK-IN-001');
    expect(result.status).toBe('completed');
    expect(result.timedOut).toBe(false);
    expect(result.attempts).toBeGreaterThanOrEqual(1);
  });
});

describe('Inventory — stock-out', () => {
  const client = new DrugPortalClient({
    environment: 'sandbox',
    csdlDuoc: { username: 'test', password: 'test' },
  });

  it('submits stock-out and polls until completed', async () => {
    const result = await client.csdlDuoc.inventory.stockOut({
      items: [{ drugId: 'DRUG-001', unitId: 'U-001', quantity: 50 }],
      reason: 'sale-retail',
    });

    expect(result.transactionId).toBe('TX-STOCK-OUT-001');
    expect(result.status).toBe('completed');
  });
});

describe('Inventory — stock-taking', () => {
  const client = new DrugPortalClient({
    environment: 'sandbox',
    csdlDuoc: { username: 'test', password: 'test' },
  });

  it('submits stock-taking and polls until completed', async () => {
    const result = await client.csdlDuoc.inventory.stockTaking({
      items: [
        {
          drugId: 'DRUG-001',
          unitId: 'U-001',
          quantity: 100,
          batchNo: 'LOT-2024-001',
          systemQuantity: 95,
          actualQuantity: 100,
        },
      ],
    });

    expect(result.transactionId).toBe('TX-STOCK-TAKING-001');
    expect(result.status).toBe('completed');
  });
});
