# Drug Portal SDK — Bằng chứng áp dụng AI có hiệu quả

> Tài liệu nội bộ ghi lại cách team iCare dùng AI (Cursor / Claude Code) để chuyển tích hợp Cổng Dược từ Odoo/Python sang TypeScript SDK, publish npm, và dựng test app — trong khi dev chính mạnh Python, không phải TypeScript.

**Liên quan:** `drug-portal-sdk-proposal (3).xlsx` · repo [drug-portal-sdk](https://github.com/vuduyviet1110/drug-portal-sdk) · [drug-portal-test-app](https://github.com/vuduyviet1110/drug-portal-test-app) · module Odoo `iCare/z_addons/san_pharmacy_sync`

---

## 1. Tóm tắt cho người review (30 giây)

| | Không AI (ước lượng) | Có AI (thực tế) |
|---|---|---|
| **Thời gian** | 6–8 tuần (1 dev Python, học TS + port thủ công) | **~1 tuần MVP** (13–20/07/2026), tiếp tục harden thêm vài ngày |
| **Người làm** | Cần thêm người biết TS/Node hoặc dev tự học stack mới | **1 dev Python** + AI viết TS, dev review & test nghiệp vụ |
| **Output** | SDK + test + docs (nếu kịp) | SDK `@icare1/drug-portal-sdk@0.1.10` trên npm, 48 unit tests pass, test app Vercel |
| **Rủi ro** | Chậm, sai mapping payload cổng dược | Dev giữ **domain knowledge** từ Odoo; AI lo boilerplate TS |

**Kết luận:** AI không thay thế hiểu biết nghiệp vụ dược — nó **rút ngắn khoảng cách ngôn ngữ/stack**. Giá trị thật nằm ở việc đã có `san_pharmacy_sync` proven trên production; AI giúp **đóng gói lại** thành SDK đa nền tảng nhanh hơn nhiều lần.

---

## 2. Bối cảnh & giả thuyết ban đầu

### Vấn đề kinh doanh
Tích hợp Cổng Dược Quốc Gia (CSDL Dược QĐ 522, Cổng Đơn Thuốc QĐ 228) là **bắt buộc** với nhà thuốc. Mỗi hệ thống tự viết lớp kết nối → lặp lại effort, dễ sai payload/validation.

### Quyết định kỹ thuật
- **Trước:** Tích hợp trong Odoo module `san_pharmacy_sync` (Python) — đã chạy thật trên iCare.
- **Sau:** Open-source SDK npm (`@icare1/drug-portal-sdk`) bằng TypeScript để bất kỳ stack nào cũng dùng được.
- **Ràng buộc proposal:** 1 dev, 4 tuần, Python làm chuẩn tham chiếu.

### Vai trò thực tế (Human-in-the-loop)

```
┌─────────────────────────────────────────────────────────────────┐
│  DEV (Python/Odoo, domain dược)                                 │
│  • Cung cấp code Odoo + tài liệu cổng làm "source of truth"     │
│  • Review logic port: payload, polling, auth, QĐ 228            │
│  • Test sandbox/production, bắt bug edge case                   │
│  • Quyết định kiến trúc SDK (public API, config, mock mode)     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ prompt + context
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  AI (Cursor / Claude Code)                                      │
│  • Scaffold TS project (package.json, tsup, vitest, eslint)     │
│  • Port Python helpers → TypeScript modules                     │
│  • Sinh types, Zod schemas, unit test skeleton, README          │
│  • Pattern generic: retry, OAuth refresh, structured logging    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ draft code
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  DEV REVIEW & VERIFY                                            │
│  • Đọc luồng từng UC, so sánh với Odoo                          │
│  • Chạy test app, fix khi AI dịch sai                           │
│  • Commit có chủ đích (không blind accept)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Workflow AI đã áp dụng (cụ thể, lặp lại được)

### Bước 1 — Chuẩn bị context (do dev làm, AI không tự biết)
Đưa vào AI session:
1. File Python tương ứng trong `san_pharmacy_sync` (ví dụ `csdlduoc_service.py`, `csdlduoc_payload.py`, `async_polling.py`, `national_rx_service.py`)
2. Đoạn tài liệu API cổng dược (endpoint, field name, status polling)
3. Use case từ proposal (UC1–UC7)

> **Nguyên tắc:** AI port **từ code đã proven**, không để AI tự đoán nghiệp vụ dược từ đầu.

### Bước 2 — Port theo module (AI generate, dev review)
Mỗi lần port 1 module Python → 1 file TS, kèm comment traceability:

| Python (Odoo) | TypeScript (SDK) | UC |
|---|---|---|
| `services/csdlduoc_service.py` — login, HTTP, sync | `src/auth/csdl-duoc-auth.ts`, `src/http/http-client.ts` | UC1, UC2 |
| `services/csdlduoc_service.py` — search drugs | `src/csdl-duoc/drugs.ts` | UC3, UC4 |
| `helpers/csdlduoc_payload.py` + `stock_reason.py` | `src/csdl-duoc/inventory.ts` | UC5, UC6, UC7 |
| `helpers/async_polling.py` + `constants.py` | `src/csdl-duoc/inventory.ts`, `src/constants.ts` | UC5–UC7 |
| `services/national_rx_service.py` | `src/qd228/prescriptions.ts`, `src/auth/qd228-auth.ts` | QĐ 228 |
| `helpers/master_data.py` | `src/csdl-duoc/master-data.ts` | UC3 |

Ví dụ comment traceability trong code SDK:

```typescript
// src/csdl-duoc/inventory.ts
/**
 * Ported from Python:
 * - `CsdlDuocPayloadBuilder` (helpers/csdlduoc_payload.py)
 * - `StockReasonMapper` (helpers/stock_reason.py)
 * - `poll_until_terminal()` (helpers/async_polling.py)
 */
```

### Bước 3 — Test & chứng minh (dev + AI hỗ trợ)
- AI sinh skeleton Vitest + MSW mock từ signature hàm
- Dev chạy `npm test` (48 tests) và test app trên sandbox
- Bug thật → dev mô tả symptom → AI suggest fix → **dev verify lại**

### Bước 4 — Test app (chứng minh SDK dùng được end-to-end)
- Repo `drug-portal-test-app`: Next.js dashboard gọi SDK qua API routes
- Deploy Vercel: https://drug-portal-test-app-kohl.vercel.app/
- Mục đích: không phải sản phẩm — là **bằng chứng tích hợp** UC3–UC7 chạy được ngoài Odoo

---

## 4. Số liệu đo lường (metrics)

### Quy mô code (đo 20/07/2026)

| Thước đo | Odoo `san_pharmacy_sync` | SDK `drug-portal-sdk` |
|---|---|---|
| File nguồn chính | 55 file `.py` (~8.058 dòng, gồm models/views/wizards Odoo) | 24 file `.ts` src (~2.814 dòng) |
| Unit tests | ~45 test cases (Odoo) | **48 test cases** (Vitest), 10 files (~833 dòng) |
| Phụ thuộc runtime | Odoo framework | **0** (chỉ `zod` + `undici`) |
| Publish | N/A (addon nội bộ) | npm `@icare1/drug-portal-sdk@0.1.10` |

### Timeline git (drug-portal-sdk)

| Ngày | Sự kiện |
|---|---|
| 13/07/2026 | Initial SDK implementation (commit đầu tiên) |
| 13–14/07 | Auth, retry, trace ID, npm scope `@icare1` |
| 16/07 | Proxy/SOCKS, token store, mock client, Zod validation |
| 20/07 | Fix Vercel/proxy (undici vs Next.js fetch), README hoàn thiện |

**4 ngày commit active** trong 7 ngày lịch → đạt MVP + harden, so với proposal 4 tuần.

### Test pass rate
```bash
cd drug-portal-sdk && npm test
# Test Files  10 passed (10)
# Tests       48 passed (48)
```

---

## 5. Gap: Có AI vs Không AI

### Không AI — ước lượng cho 1 dev Python

| Hạng mục | Effort ước lượng | Lý do |
|---|---|---|
| Học TypeScript + Node toolchain | 1–2 tuần | Team mạnh Python/Odoo, TS không phải thế mạnh |
| Port thủ công payload/auth/polling | 2–3 tuần | Logic phức tạp, nhiều edge case (base64, form-urlencoded, polling state) |
| Scaffold npm, CI, eslint, tsup | 3–5 ngày | Boilerplate không tạo giá trị nghiệp vụ |
| Viết README + types + examples | 2–3 ngày | Cần cho open-source |
| Test app Next.js | 1 tuần | Chứng minh SDK usable |
| **Tổng** | **~6–8 tuần** | Hoặc thuê thêm 1 dev TS |

### Có AI — thực tế

| Hạng mục | Ai làm | Effort dev |
|---|---|---|
| Scaffold & config | AI ~90% | Review ~2–4h |
| Port Python → TS | AI ~70% draft | Dev review + fix ~60% thời gian còn lại |
| HTTP retry, OAuth, logging | AI ~85% | Review pattern |
| Zod schemas, types, README | AI ~80% | Dev chỉnh field theo cổng thật |
| Debug edge case (proxy Vercel, field mapping QĐ 228) | AI gợi ý | **Dev quyết định** — xem mục 6 |
| Test sandbox | Dev 100% | Credentials + nghiệp vụ chỉ dev biết |
| **Tổng** | | **~1 tuần MVP + vài ngày harden** |

### Hệ số tăng tốc ước lượng

| Metric | Không AI | Có AI | Tăng tốc |
|---|---|---|---|
| Time-to-first-working-SDK | 3–4 tuần | **3–5 ngày** | **~4–6×** |
| Time-to-npm-publish | 6–8 tuần | **~1–1.5 tuần** | **~5×** |
| Dev headcount | 1 Python + 1 TS (lý tưởng) | **1 Python** | Giảm 1 FTE |
| Lines dev tự viết tay | ~100% | **~30–40%** (phần còn lại review/sửa) | |

> Các con số "không AI" là ước lượng dựa trên proposal và kinh nghiệm port cross-stack. Điểm mạnh của bằng chứng không phải con số tuyệt đối — mà là **artifact thật** (repo, npm, test app, git history) trong thời gian ngắn.

---

## 6. Bằng chứng dev vẫn là "owner" — AI không làm thay

Đây là phần quan trọng khi trình bày: AI tăng tốc **implementation**, dev giữ **correctness**.

### 6.1 Bug / gap AI không tự phát hiện — dev fix qua test thật

| Vấn đề | Phát hiện bởi | Fix |
|---|---|---|
| Next.js patch `globalThis.fetch` → proxy không chạy trên Vercel | Test app deploy | Dynamic import `undici` fetch (`3756282`, `647acd1`) |
| Field mapping QĐ 228 thiếu (`patientName`, `prescribedQuantity`…) | Sandbox API response khác mock | Dev chỉnh `prescriptions.ts` (`f5768f9`) |
| Zod schema quá strict (`supplierId` required) | Unit test fail | Dev nới schema theo spec cổng (`fe97281`) |
| `undici` version conflict với Vitest | CI/test | Dev downgrade/upgrade có chủ đích (`fef2dc7`, `407fe94`) |
| Mock mode phải chạy Zod trước khi trả mock | Review luồng UC | Dev refactor `inventory.ts` (`bf88097`) |

→ **Lesson:** AI sinh code "đúng cú pháp TS", nhưng **đúng nghiệp vụ cổng dược** chỉ verify được khi dev đã từng tích hợp Odoo + test sandbox.

### 6.2 Quyết định kiến trúc do dev đưa ra (không có trong Python gốc)

AI implement theo spec dev đưa:
- `useMock` mode cho CI/offline dev
- `FileTokenStore` / `RedisTokenStore` — tránh rate-limit login
- `proxyUrl` SOCKS5/HTTP — bypass IP nước ngoài trên Vercel/AWS
- Public API `DrugPortalClient` facade — tách CSDL Dược vs QĐ 228

### 6.3 Source of truth luôn là Odoo module

Khi review, dev so sánh trực tiếp:
- Python `poll_until_terminal()` ↔ TS polling loop trong `inventory.ts`
- Python `TERMINAL_STATUSES = {"completed", "rejected", "error"}` ↔ `src/constants.ts`
- Python base64 password + `x-www-form-urlencoded` ↔ `csdl-duoc-auth.ts`

---

## 7. Cách trình bày cho stakeholder / review nội bộ

### Demo 15 phút (đề xuất)

1. **2 phút — Bối cảnh:** "Đã tích hợp cổng dược trên Odoo 1 năm. Giờ đóng gói thành SDK open-source."
2. **3 phút — Live test app:** Mở https://drug-portal-test-app-kohl.vercel.app/ → search thuốc → stock-in mock/sandbox.
3. **3 phút — Code traceability:** Mở song song `csdlduoc_payload.py` và `inventory.ts`, chỉ comment "Ported from Python".
4. **2 phút — npm:** `npm i @icare1/drug-portal-sdk` + 10 dòng Quick Start từ README.
5. **3 phút — AI impact:** Bảng mục 1 + timeline git 13→20/07.
6. **2 phút — Honest limits:** "AI viết TS, tôi review & test. Bug proxy/field mapping do tôi bắt khi deploy thật."

### Artifact nên đính kèm khi báo cáo

| Artifact | Đường dẫn | Chứng minh gì |
|---|---|---|
| Proposal gốc | `drug-portal-sdk-proposal (3).xlsx` | Scope UC, constraint 4 tuần, mục "Applied AI" |
| SDK repo | `~/projects/drug-portal-sdk` | Code, tests, git history |
| Odoo reference | `~/projects/iCare/z_addons/san_pharmacy_sync` | Domain knowledge có sẵn trước AI |
| Test app | `~/projects/drug-portal-test-app` | End-to-end integration |
| npm package | `@icare1/drug-portal-sdk@0.1.10` | Deliverable publish được |
| AI session log | `.specstory/history/` | Prompt → code trail (nếu cần audit) |

### Câu trả lời cho câu hỏi thường gặp

**"AI viết hết thì dev làm gì?"**
→ Dev cung cấp Odoo code + spec cổng (input), review từng UC, test sandbox, fix bug production-grade (proxy, schema, field mapping). Không có `san_pharmacy_sync`, AI không thể tự làm đúng SDK này.

**"Sao không viết tiếp bằng Python?"**
→ Mục tiêu là npm SDK cho ecosystem JS/Node (và sau này adapter đa ngôn ngữ). Python đã có trong Odoo; TS mở rộng đối tượng dùng.

**"Làm sao biết AI có hiệu quả chứ không phải dev giỏi TS?"**
→ Profile dev: Python/Odoo. Timeline: MVP trong ngày đầu (13/07). Commit history cho thấy nhiều fix nhỏ sau review (proxy, zod, field map) — pattern điển hình human-in-the-loop, không phải dev TS viết một mạch.

**"Rủi ro gì?"**
→ AI có thể dịch sai edge case; mitigated bằng 48 unit tests + Odoo parity check + sandbox test. Proposal đã nêu: cần ≥2 maintainer khi cổng đổi API.

---

## 8. Mapping Use Case → Deliverable

| UC | Mô tả | SDK API | Test |
|---|---|---|---|
| UC1 | Khởi tạo & cấu hình | `new DrugPortalClient({...})` | `tests/unit/config.test.ts`, `client.test.ts` |
| UC2 | Auth & auto-refresh token | `CsdlDuocAuth` | `tests/unit/auth.test.ts` |
| UC3 | Tìm kiếm thuốc | `client.csdlDuoc.drugs.search()` | `tests/unit/drugs.test.ts` |
| UC4 | Chi tiết / tạo SP | `client.csdlDuoc.drugs.getDetail()` | `drugs.test.ts` |
| UC5 | Đồng bộ nhập kho | `client.csdlDuoc.inventory.stockIn()` | `tests/unit/inventory.test.ts` |
| UC6 | Đồng bộ xuất kho | `client.csdlDuoc.inventory.stockOut()` | `inventory.test.ts` |
| UC7 | Kiểm kho | `client.csdlDuoc.inventory.stockTaking()` | `inventory.test.ts` |
| QĐ 228 | Tra cứu & cập nhật đơn | `client.qd228.prescriptions.*` | `tests/unit/prescriptions.test.ts` |

---

## 9. Kết luận

Dự án Drug Portal SDK là case study hợp lý cho **AI-assisted porting**:

1. **Có tài sản tri thức sẵn** (`san_pharmacy_sync`) — AI không đoán nghiệp vụ.
2. **Gap stack rõ ràng** (Python → TypeScript) — đúng điểm AI mạnh.
3. **Dev giữ vai trò architect + QA domain** — review, test, fix production issues.
4. **Kết quả đo được** — npm package, 48 tests, test app Vercel, ~1 tuần thay vì ước lượng 6–8 tuần không AI.

**Công thức tóm gọn:**

```
SDK chất lượng = Domain knowledge (Odoo) × AI (TS codegen) × Human review (sandbox/test)
```

---

*Tài liệu tạo: 20/07/2026 · Maintainer: iCare Health*
