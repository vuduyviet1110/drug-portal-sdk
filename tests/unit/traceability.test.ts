import { describe, it, expect, vi } from 'vitest';
import '../helpers/mock-handlers';
import { DrugPortalClient } from '../../src/index';

describe('Traceability', () => {
  it('propagates custom traceId to logs in drug searches', async () => {
    const customLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const client = new DrugPortalClient({
      environment: 'sandbox',
      csdlDuoc: { username: 'test', password: 'test' },
      logger: customLogger,
    });

    await client.csdlDuoc.drugs.search('paracetamol', {}, { traceId: 'custom-trace-id-search' });

    // Assert that the logger was called with custom-trace-id-search
    const infoCalls = customLogger.info.mock.calls;
    const debugCalls = customLogger.debug.mock.calls;

    // Check if the traceId was passed inside metadata parameters of debug/info calls
    const hasTraceIdInInfo = infoCalls.some(call => call[1] && call[1].traceId === 'custom-trace-id-search');
    const hasTraceIdInDebug = debugCalls.some(call => call[1] && call[1].traceId === 'custom-trace-id-search');

    expect(hasTraceIdInInfo || hasTraceIdInDebug).toBe(true);
  });

  it('propagates custom traceId to logs in inventory operations', async () => {
    const customLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const client = new DrugPortalClient({
      environment: 'sandbox',
      csdlDuoc: {
        username: 'test',
        password: 'test',
        storeId: 'STORE-001',
        warehouseCode: 'WH-001',
      },
      logger: customLogger,
    });

    await client.csdlDuoc.inventory.stockIn({
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
    }, { traceId: 'custom-trace-id-inventory' });

    const infoCalls = customLogger.info.mock.calls;
    const debugCalls = customLogger.debug.mock.calls;

    const hasTraceIdInInfo = infoCalls.some(call => call[1] && call[1].traceId === 'custom-trace-id-inventory');
    const hasTraceIdInDebug = debugCalls.some(call => call[1] && call[1].traceId === 'custom-trace-id-inventory');

    expect(hasTraceIdInInfo || hasTraceIdInDebug).toBe(true);
  });

  it('keeps the same traceId during a 401 unauthorized auto-recovery retry flow', async () => {
    const { http, HttpResponse } = await import('msw');
    const { server } = await import('../helpers/mock-handlers');

    let requestCount = 0;
    server.use(
      http.post('*/api/pos/product/get-paged', async () => {
        requestCount++;
        if (requestCount === 1) {
          return new HttpResponse(JSON.stringify({ message: 'Token expired' }), { status: 401 });
        }
        return HttpResponse.json({
          result: {
            items: [{ drugId: 'DRUG-001', productName: 'Paracetamol 500mg' }],
            total: 1,
          },
        });
      })
    );

    const customLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const client = new DrugPortalClient({
      environment: 'sandbox',
      csdlDuoc: { username: 'test', password: 'test' },
      logger: customLogger,
    });

    const specificTraceId = 'my-401-retry-trace-id';
    const result = await client.csdlDuoc.drugs.search('paracetamol', { source: 'pos' }, { traceId: specificTraceId });

    expect(result.items[0]?.id).toBe('DRUG-001');
    expect(requestCount).toBe(2); // First failed 401, second retry succeeded

    // Gather logs to inspect traceId consistency
    const allLogCalls = [
      ...customLogger.debug.mock.calls,
      ...customLogger.info.mock.calls,
      ...customLogger.warn.mock.calls,
      ...customLogger.error.mock.calls,
    ];

    // Filter log entries that belong to this specific flow
    const relevantCalls = allLogCalls.filter(call => call[1] && call[1].traceId === specificTraceId);

    // Should have logs for request, 401 warn, authenticating (onUnauthorized), and retry request.
    expect(relevantCalls.length).toBeGreaterThanOrEqual(3);

    // Verify a warning about 401 was emitted with our traceId
    const warn401Call = customLogger.warn.mock.calls.find(call => 
      call[0].includes('401 Unauthorized') && call[1]?.traceId === specificTraceId
    );
    expect(warn401Call).toBeDefined();

    // Verify token refresh logs (Authenticating with CSDL Dược) contained our traceId
    const refreshAuthCall = customLogger.info.mock.calls.find(call => 
      call[0].includes('Authenticating with CSDL Dược') && call[1]?.traceId === specificTraceId
    );
    expect(refreshAuthCall).toBeDefined();
  });
});

