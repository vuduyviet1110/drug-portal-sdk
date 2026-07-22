import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import '../helpers/mock-handlers';
import { server } from '../helpers/mock-handlers';
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

  it('maps diagnosis array into a joined string', async () => {
    server.use(
      http.get('*/thong-tin-don-thuoc/:code', () =>
        HttpResponse.json({
          ma_don_thuoc: 'DH002',
          chan_doan: [
            { ma_chan_doan: 'J06', ten_chan_doan: 'Viêm họng' },
            { ma_chan_doan: 'R50', ten_chan_doan: 'Sốt' },
          ],
          thong_tin_don_thuoc: [],
        }),
      ),
    );

    const rx = await client.qd228!.prescriptions.get('DH002');
    expect(rx.diagnosis).toBe('Viêm họng, Sốt');
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

  it('retries updateSaleQty and returns failure after all retries', async () => {
    vi.useFakeTimers();
    server.use(
      http.post('*/cap-nhat-don-thuoc', () => new HttpResponse('fail', { status: 500 })),
    );

    const clientWithRetry = new DrugPortalClient({
      environment: 'sandbox',
      qd228: { appName: 'test-app', appKey: 'test-key' },
      retry: { maxRetries: 0, baseDelayMs: 1 },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    const promise = clientWithRetry.qd228!.prescriptions.updateSaleQty({
      maDonThuoc: 'DH001',
      items: [{ drugId: '1', drugName: 'A', unitName: 'Viên', soldQuantity: 1 }],
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    vi.useRealTimers();
  });
});
