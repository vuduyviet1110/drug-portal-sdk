import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import '../helpers/mock-handlers';
import { server } from '../helpers/mock-handlers';
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

  it('rejects invalid stock-in payload via Zod', async () => {
    await expect(
      client.csdlDuoc.inventory.stockIn({
        items: [],
        reason: 'supplier',
      }),
    ).rejects.toThrow();
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

describe('Inventory — polling edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    server.resetHandlers();
  });

  it('returns rejected terminal status without timeout', async () => {
    server.use(
      http.get('*/transactions/:type/:id/status', () =>
        HttpResponse.json({ status: 'rejected', transaction_id: 'TX-1' }),
      ),
    );

    const client = new DrugPortalClient({
      environment: 'sandbox',
      csdlDuoc: { username: 'test', password: 'test' },
    });

    const resultPromise = client.csdlDuoc.inventory.pollTransaction('stock-in', 'TX-1');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe('rejected');
    expect(result.timedOut).toBe(false);
  });

  it('waits through processing then completes', async () => {
    let polls = 0;
    server.use(
      http.get('*/transactions/:type/:id/status', () => {
        polls++;
        if (polls === 1) {
          return HttpResponse.json({ status: 'processing' });
        }
        return HttpResponse.json({ status: 'completed', transaction_id: 'TX-2' });
      }),
    );

    const client = new DrugPortalClient({
      environment: 'sandbox',
      csdlDuoc: { username: 'test', password: 'test' },
    });

    const resultPromise = client.csdlDuoc.inventory.pollTransaction('stock-out', 'TX-2');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe('completed');
    expect(result.attempts).toBeGreaterThanOrEqual(2);
  });
});
