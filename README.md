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

- ✅ **CSDL Dược QĐ 522**: OAuth login, auto-refresh token, drug catalog search, master data lookups, stock-in/out/taking with polling
- ✅ **Cổng Đơn Thuốc QĐ 228**: Prescription lookup, sale quantity updates (UC05) with retry
- ✅ **Robust HTTP**: Retry with exponential backoff (429/5xx), structured logging with trace ID, secret masking
- ✅ **TypeScript-first**: Full type safety, ESM + CJS + `.d.ts` support
- ✅ **Node 18+**: Uses native `fetch`, zero external runtime dependencies

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

  // Advanced
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
  proxyUrl?: 'http://username:password@ip:port', // Optional proxy
});
```

---

## Advanced Features

### 1. Bypassing Cloud Firewall Restrictions (Proxy Support)
Vietnamese regulatory servers (`api-sandbox.csdlduoc.com.vn`, `donthuocquocgia.vn`) often block foreign cloud IP addresses (such as Vercel, AWS, GCP). You can easily route your requests through a Vietnamese proxy server by passing the `proxyUrl` option:

```typescript
const client = new DrugPortalClient({
  environment: 'production',
  proxyUrl: 'http://username:password@vietnam-proxy-ip:port', // Optional Vietnamese proxy
  csdlDuoc: { ... },
});
```

### 2. Token Caching & Persistence Store
To prevent calling `POST /auth/login` too frequently (which triggers rate-limits), it is recommended to cache and restore the authentication tokens using one of our built-in `TokenStore` adapters:

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

### 3. Unit Testing with Mock Client
To write unit and integration tests for your own application without hitting live API endpoints, you can import and use `MockDrugPortalClient`:

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
