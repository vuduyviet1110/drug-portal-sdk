# Drug Portal SDK

**TypeScript SDK** for Vietnam National Drug Portal APIs — **CSDL Dược (QĐ 522)** & **Cổng Đơn Thuốc (QĐ 228)**.

```bash
npm install @icare1/drug-portal-sdk
```

---

## Live Demo & Test App

We built a professional Next.js + Tailwind CSS clinical dashboard test application demonstrating this SDK integration:
- 🔗 **Vercel Test App Link**: [https://drug-portal-test-app-kohl.vercel.app/](https://drug-portal-test-app-kohl.vercel.app/)
- 🐙 **GitHub Repository**: [https://github.com/vuduyviet1110/drug-portal-test-app](https://github.com/vuduyviet1110/drug-portal-test-app)

---

## Features

- ✅ **CSDL Dược QĐ 522**: OAuth login, auto-refresh token, drug catalog search, master data lookups, stock-in/out/taking with polling.
- ✅ **Cổng Đơn Thuốc QĐ 228**: Prescription lookup, sale quantity updates (UC05) with retry.
- ✅ **Zod Input Validation**: In-built client-side schemas preventing bad API requests before hitting remote servers.
- ✅ **Offline Mock Mode**: Toggleable offline mock stubs via `useMock` config for local development and testing.
- ✅ **Advanced Proxy Routing**: Out-of-the-box support for HTTP/HTTPS/SOCKS5 proxies, tailored to work under serverless platforms (Vercel, AWS Lambda) by bypassing Next.js global `fetch` patches.
- ✅ **Robust HTTP**: Retry with exponential backoff (429/5xx), structured logging with trace ID, secret masking.
- ✅ **TypeScript-first**: Full type safety, ESM + CJS + `.d.ts` support.
- ✅ **Node 18+**: Zero external runtime dependencies.

---

## Quick Start

```typescript
import { DrugPortalClient } from '@icare1/drug-portal-sdk';

const client = new DrugPortalClient({
  environment: 'sandbox', // or 'production'
  csdlDuoc: {
    username: 'your-username',
    password: 'your-password',
  },
  qd228: {
    appName: 'your-app-name',
    appKey: 'your-app-key',
  },
});

// Search drugs (POS portal first, fallback to master catalog)
const drugs = await client.csdlDuoc.drugs.search('paracetamol');
console.log(drugs.items); // [{ id, name, registrationNumber, source }]

// Get drug detail
const detail = await client.csdlDuoc.drugs.getDetail(drugs.items[0].id);
console.log(detail.name, detail.packagings);

// Stock-in (nhập kho)
const result = await client.csdlDuoc.inventory.stockIn({
  items: [{
    drugId: 'DRUG-001',
    unitId: 'U-001',
    quantity: 100,
    batchNo: 'LOT-2024-001',
    expiryDate: '2025-12-31',
    manufacturer: { id: 'M-001', name: 'Pharma Corp' },
  }],
  reason: 'supplier',
  referenceNumber: 'PO-2024-001',
});
console.log(result.transactionId, result.status); // 'completed'

// Lookup prescription (QĐ 228)
const rx = await client.qd228.prescriptions.get('DH001');
console.log(rx.items); // drug list in prescription
```

---

## Configuration

```typescript
new DrugPortalClient({
  environment: 'sandbox' | 'production',

  // CSDL Dược (QĐ 522) — optional
  csdlDuoc: {
    username: string,
    password: string,
    storeId?: string,       // for transaction payloads
    warehouseCode?: string, // for transaction payloads
  },

  // Cổng Đơn Thuốc (QĐ 228) — optional
  qd228: {
    appName: string,
    appKey: string,
  },

  // Advanced Configurations
  useMock?: boolean,           // Enable offline mock mode (runs Zod validation first)
  proxyUrl?: string,           // Proxy URL (supports SOCKS5 / HTTP / HTTPS)
  csdlDuocBaseUrl?: string,    // override API URL
  nationalRxBaseUrl?: string,  // override QĐ 228 URL
  retry?: {
    maxRetries: 3,
    baseDelayMs: 5000,
    timeoutMs: 30000,
  },
  tokenTtlHours?: 23,
  onTokenChange?: (token, expiresAt) => void,
  cachedToken?: string,
  cachedTokenExpiresAt?: Date,
});
```

---

## Advanced Features

### 1. In-built Input Validation (Zod)
All inventory transactions (`stockIn`, `stockOut`, `stockTaking`) are validated locally against Zod schemas *before* making any remote HTTP calls. This captures bad payloads instantly, preventing rate-limiting blocks from CSDL Dược servers.

```typescript
try {
  await client.csdlDuoc.inventory.stockIn({
    items: [{
      drugId: 'DRUG-001',
      unitId: 'U-001',
      quantity: -5, // ❌ Will throw ZodError immediately (quantity must be positive)
    }],
    reason: 'supplier'
  });
} catch (error) {
  console.log(error.issues); // Lists exact missing/invalid parameters (e.g. quantity must be positive)
}
```

### 2. Offline Mock Mode (`useMock: true`)
If `useMock: true` is configured, the SDK runs all Zod input validation rules first, but intercepts remote operations and immediately returns mock completed transactions. Excellent for CI/CD runs, offline local development, or fast sandbox prototyping.

```typescript
const client = new DrugPortalClient({
  environment: 'sandbox',
  useMock: true,
});

// Zod validation runs first, then mock response is returned in <1ms without internet
const result = await client.csdlDuoc.inventory.stockIn({
  items: [{ drugId: 'DRUG-001', unitId: 'U-001', quantity: 10 }],
  reason: 'supplier',
  supplierId: 'SUPP-001'
});
console.log(result.status); // "completed"
console.log(result.transactionId); // "tx-mock-in-1784525137036"
```

### 3. Serverless & AWS Firewall Bypassing (Proxy Support)
Vietnamese regulatory servers (`api-sandbox.csdlduoc.com.vn`, `donthuocquocgia.vn`) block foreign cloud IP addresses (Vercel, AWS Lambda, GCP). The SDK offers robust proxy support (HTTP, HTTPS, and SOCKS5):

```typescript
const client = new DrugPortalClient({
  environment: 'production',
  proxyUrl: 'http://username:password@vietnam-proxy-ip:8080', // HTTP proxy
  // proxyUrl: 'socks5://vietnam-proxy-ip:1080',             // SOCKS5 proxy
  csdlDuoc: { ... },
});
```

#### Why it works on Vercel/Next.js:
* **Next.js fetch-patch bypass**: Next.js App Router patches `globalThis.fetch` to support Server Components caching, which breaks proxy dispatchers. The SDK bypasses this on-the-fly by dynamically importing and using raw `undici` fetch whenever a `proxyUrl` is configured.
* **Hybrid Fallback Strategy**: If `proxyUrl` is undefined, the SDK reverts to `globalThis.fetch`. This ensures local mock test environments (like MSW/nock/Vitest) continue to intercept network requests normally without breaking.
* **Serverless Port Support**: SOCKS5 ports (e.g., `1080`) are often blocked by AWS Lambda firewall rules. Using standard HTTP/HTTPS proxies on common ports (like `80`, `8080`, `3128`) allows requests to route seamlessly on serverless platforms.

### 4. Token Caching & Persistence Store
To prevent calling `POST /auth/login` too frequently (which triggers rate-limits), cache and restore authentication tokens using one of our built-in `TokenStore` adapters:

```typescript
import { DrugPortalClient, FileTokenStore, RedisTokenStore } from '@icare1/drug-portal-sdk';
import { createClient } from 'redis';

// File-system Cache Store (caches to .token_cache.json by default)
const fileStore = new FileTokenStore();

// Or Redis Cache Store
const redisClient = createClient();
const redisStore = new RedisTokenStore(redisClient);

const client = new DrugPortalClient({
  environment: 'production',
  csdlDuoc: { ... },
  
  // Restore cached token on startup
  ...(await fileStore.get('csdl_duoc')),

  // Save token changes
  onTokenChange: async (token, expiresAt) => {
    await fileStore.set('csdl_duoc', { accessToken: token, expiresAt });
  }
});
```

---

### 5. Unit Testing with Mock Client
If you want to configure specific custom mocks in-memory, you can import and use `MockDrugPortalClient`:

```typescript
import { MockDrugPortalClient } from '@icare1/drug-portal-sdk';

const mockClient = new MockDrugPortalClient();

// Configure custom mock data
mockClient.mockDrugs.push({
  id: '99',
  name: 'Custom Mock Medicine 500mg',
  registrationNumber: 'VD-999-24',
  baseUnit: 'Viên',
  source: 'pos',
});

// Mock lookup will search the in-memory mock store
const drugs = await mockClient.csdlDuoc.drugs.search('Custom Mock');
console.log(drugs.items[0].name); // 'Custom Mock Medicine 500mg'
```

---

## API Reference

### `DrugPortalClient`

| Method | Description |
|---|---|
| `csdlDuoc.drugs.search(keyword)` | Search drugs (POS + fallback master) |
| `csdlDuoc.drugs.getDetail(drugId)` | Get full drug detail |
| `csdlDuoc.masterData.getUnits()` | Get unit list |
| `csdlDuoc.masterData.getRoutes()` | Get route list |
| `csdlDuoc.inventory.stockIn(opts)` | Submit stock-in + auto-poll |
| `csdlDuoc.inventory.stockOut(opts)` | Submit stock-out + auto-poll |
| `csdlDuoc.inventory.stockTaking(opts)` | Submit stock-taking + auto-poll |
| `csdlDuoc.inventory.pollTransaction(type, id)` | Poll existing transaction |
| `qd228.prescriptions.get(code)` | Lookup prescription by code |
| `qd228.prescriptions.updateSaleQty(opts)` | Update prescription sale qty (UC05) |

---

## Authentication

**CSDL Dược (OAuth)**: Auto-login on first request, token cached in memory (23h TTL), auto-refresh on 401 or expiry.

**QĐ 228 (Static headers)**: `app-name` + `app-key` injected into every request. No refresh.

---

## Testing

```bash
npm test                    # Unit tests (Vitest + msw mock)
npm run test:integration    # Sandbox integration tests (needs real credentials)
npm run build               # Build ESM + CJS + d.ts
```

---

## API Endpoints

| Portal | Endpoint | Method |
|---|---|---|
| CSDL Dược | `POST /auth/login` | OAuth login |
| CSDL Dược | `POST /api/pos/product/get-paged` | Drug search (POS portal) |
| CSDL Dược | `GET /master/drugs` | Drug catalog search |
| CSDL Dược | `GET /master/drugs/{id}` | Drug detail |
| CSDL Dược | `POST /transactions/stock-in` | Stock-in |
| CSDL Dược | `POST /transactions/stock-out` | Stock-out |
| CSDL Dược | `POST /transactions/stock-taking` | Stock-taking |
| CSDL Dược | `GET /transactions/{type}/{id}/status` | Poll transaction status |
| QĐ 228 | `GET /api/v1/thong-tin-don-thuoc/{code}` | Prescription lookup |
| QĐ 228 | `POST /api/v1/cap-nhat-don-thuoc` | Update sale qty |

---

## License

MIT © 2025 iCare Health
