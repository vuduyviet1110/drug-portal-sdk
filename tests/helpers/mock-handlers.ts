import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';

// ─── MSW handlers for mocking drug portal APIs ───────────────────

let loginCallCount = 0;

export function resetLoginCounter(): void {
  loginCallCount = 0;
}

export function getLoginCallCount(): number {
  return loginCallCount;
}

// Dynamic handler for login that tracks call count
const loginHandler = http.post('*/auth/login', async ({ request }) => {
  loginCallCount++;
  const body = await request.text();
  if (body.includes('wrong')) {
    return new HttpResponse('Invalid credentials', { status: 401 });
  }
  return HttpResponse.json({
    access_token: 'test-access-token-12345',
    expires_in: 82_800, // 23 hours
  });
});

const handlers = [
  loginHandler,

  // POS drug search
  http.post('*/api/pos/product/get-paged', async () => {
    return HttpResponse.json({
      result: {
        items: [
          {
            drugId: 'DRUG-001',
            productName: 'Paracetamol 500mg',
            registrationNumber: 'VD-12345',
            baseUnit: 'Viên',
          },
          {
            drugId: 'DRUG-002',
            productName: 'Paracetamol 250mg',
            registrationNumber: 'VD-12346',
            baseUnit: 'Gói',
          },
        ],
        total: 2,
      },
    });
  }),

  // Master drugs search (fallback)
  http.get('*/master/drugs', async () => {
    return HttpResponse.json({
      items: [
        { id: 'DRUG-001', name: 'Paracetamol 500mg' },
        { id: 'DRUG-002', name: 'Paracetamol 250mg' },
      ],
      total: 2,
    });
  }),

  // Master drug detail
  http.get('*/master/drugs/:id', async ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: 'Paracetamol 500mg',
      ma_thuoc_qg: 'DRUG-001',
      so_dang_ky: 'VD-12345',
      packagings: [
        { id: 'PKG-1', isBasicUnit: true, unitName: 'Viên', quantity: 1 },
        {
          id: 'PKG-2',
          isBasicUnit: false,
          unitName: 'Hộp',
          quantity: 10,
          conversionRateToBase: 10,
        },
      ],
    });
  }),

  // Master units
  http.get('*/master/units', async () => {
    return HttpResponse.json({
      items: [
        { id: 'U-001', name: 'Viên' },
        { id: 'U-002', name: 'Gói' },
        { id: 'U-003', name: 'Hộp' },
      ],
      total: 3,
    });
  }),

  // Master routes
  http.get('*/master/routes', async () => {
    return HttpResponse.json({
      items: [{ id: 'R-001', name: 'Uống' }],
      total: 1,
    });
  }),

  // Stock-in transaction
  http.post('*/transactions/stock-in', async () => {
    return HttpResponse.json({ transaction_id: 'TX-STOCK-IN-001' });
  }),

  // Stock-out transaction
  http.post('*/transactions/stock-out', async () => {
    return HttpResponse.json({ transaction_id: 'TX-STOCK-OUT-001' });
  }),

  // Stock-taking transaction
  http.post('*/transactions/stock-taking', async () => {
    return HttpResponse.json({ transaction_id: 'TX-STOCK-TAKING-001' });
  }),

  // Transaction status polling — returns 'completed' immediately
  http.get('*/transactions/:type/:id/status', async ({ params }) => {
    return HttpResponse.json({
      status: 'completed',
      transaction_id: params.id,
    });
  }),

  // QĐ 228 prescription lookup
  http.get('*/thong-tin-don-thuoc/:code', async ({ params }) => {
    return HttpResponse.json({
      ma_don_thuoc: params.code,
      ngay_sinh_benh_nhan: '1990-01-01',
      chan_doan: 'Sốt',
      ten_bac_si: 'BS Nguyễn Văn A',
      thong_tin_don_thuoc: [
        {
          ma_thuoc: 'DRUG-001',
          ten_thuoc: 'Paracetamol 500mg',
          don_vi: 'Viên',
          so_luong_to: 10,
          cach_dung: 'Uống cách 4-6h',
        },
      ],
    });
  }),

  // QĐ 228 update prescription sale qty
  http.post('*/cap-nhat-don-thuoc', async () => {
    return HttpResponse.json({ success: true, message: 'Cập nhật thành công' });
  }),
];

// Setup MSW server for tests
export const server = setupServer(...handlers);

// Start before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
// Reset handlers after each test
afterEach(() => server.resetHandlers());
// Clean up after all tests
afterAll(() => server.close());
