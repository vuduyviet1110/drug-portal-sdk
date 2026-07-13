# Changelog

All notable changes to `@icare1/drug-portal-sdk` will be documented in this file.

## [0.1.1] — 2026-07-13

### Fixed

- Support flat API response structure with `items` and `totalCount` directly at the root in POS drug search response.
- Fix race condition during concurrent CSDL Dược logins by introducing a promise lock.
- Wrap `onTokenChange` callback execution in try/catch to isolate external database storage errors.
- Prevent duplicate logging to stdout when a custom delegate logger is configured.

## [0.1.0] — 2025-01-01

### Added

- **Initial release**
- `DrugPortalClient` main entry point
- **CSDL Dược (QĐ 522)**
  - OAuth login with x-www-form-urlencoded, base64 password
  - Auto token refresh on 401 or TTL expiry
  - Drug search (POS portal + fallback master catalog)
  - Drug detail lookup
  - Master data lookups: units, routes, countries, drug groups, manufacturers, active ingredients
  - Stock-in (nhập kho) with payload builder + polling
  - Stock-out (xuất kho) with payload builder + polling
  - Stock-taking (kiểm kho) with payload builder + polling
  - Transaction status polling (max 30 attempts)
- **Cổng Đơn Thuốc (QĐ 228)**
  - Static app-name/app-key authentication
  - Prescription lookup by code
  - Sale quantity update (UC05) with retry (2 attempts, 30s delay)
- **HTTP client**
  - Retry with exponential backoff for 429/5xx
  - Timeout handling (default 30s)
  - Structured JSON logging with trace ID
  - Secret masking (password, token, access_token, app-key)
- TypeScript types for all APIs
- ESM + CJS + `.d.ts` build output
- Unit tests with Vitest + msw mock
- GitHub Actions CI workflow
- Examples: basic usage, stock-in, prescription lookup

### Ported from Python

- `san_pharmacy_sync` module (Odoo 17)
- `CsdlDuocService` → `HttpClient` + `CsdlDuocAuth` + `DrugClient` + `InventoryClient`
- `NationalRxService` → `PrescriptionClient` + `Qd228Auth`
- `CsdlDuocPayloadBuilder` → `InventoryClient.buildPayload()`
- `StockReasonMapper` → `InventoryClient.mapReason()`
- `MasterDataMapper` → `DrugClient.mapDrugDetail()` + response parsers
- `poll_until_terminal()` → `InventoryClient.pollTransaction()`
