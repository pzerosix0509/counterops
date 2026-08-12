# Bối cảnh kiểm thử (tests context)

> Tài liệu này tổng hợp chiến lược kiểm thử, ánh xạ các Use Case (UC) sang các tệp test,
> cùng các refactor giúp logic thuần (pure logic) có thể unit-test được. Đây là file ngữ cảnh
> độc lập, bổ sung cho `docs/ai-context.md` và `docs/onboarding-error-redirect-loop.md`.

## 1. Nguyên tắc kiểm thử trong dự án

- Framework: **Vitest** (`npm test` = `vitest run`), cấu hình tại `vitest.config.ts`.
- Chỉ alias `/@` và `server-only`; chưa alias `next/cache`, `next/headers`, `next/navigation`.
- Do đó các **server action / query** (`src/server/actions`, `src/server/queries`) không được import
  trực tiếp trong test. Dự án chọn phong cách **test logic thuần** (calculations + zod schemas).
- Khi cần test nghiệp vụ nằm gọn trong một action, ta **tách logic ra hàm thuần** trong
  `src/lib/calculations/*` hoặc `src/lib/ai/*`, rồi action gọi hàm đó — không đổi hành vi.

## 2. Ánh xạ UC -> tệp test

| UC | Nội dung | Tệp test | Vị trí logic được test |
|---|---|---|---|
| UC01 | Login và Onboard | `src/__tests__/validation.test.ts`, `use-branch-realtime.test.tsx` | schemas + hook realtime |
| UC02 | Quản lý Menu | `excel-parser.test.ts`, `excel-export.test.ts`, `excel-commit.test.ts` | import/export/commit sản phẩm |
| UC03 | Quản lý Bàn | `src/__tests__/tables.test.ts` *(mới)* | schemas + `canFreeTable` |
| UC04 | Quản lý Kho | `inventory.test.ts`, `excel-*.test.ts` | tính toán kho + excel |
| UC05 | Đặt & Thanh toán Đơn | `orders.test.ts` | tính toán đơn |
| UC06 | Cập nhật Trạng thái Bếp | `src/__tests__/kitchen.test.ts` *(mới)* | `kitchenStatusSchema` + `transformKitchenItems` |
| UC07 | Dashboard & Báo cáo EOD | `src/__tests__/dashboard.test.ts` *(mới)* | aggregation dashboard (+ `buildEodExport` trong excel-export) |
| UC08 | Hỏi AI Analyst | `ai.test.ts`, `ai-golden.test.ts`, `ai-runtime.test.ts`, `ai-migration.test.ts`, `web-search/intent-classifier/image-to-text/llm-planner` | AI lib/server |
| UC09 | Tải lên Tài liệu AI | `src/__tests__/ai-documents.test.ts` *(mới)* | `uploadDocumentSchema` + `validateDocumentContentLength` |
| UC10 | Cấu hình Thiết lập | `src/__tests__/settings.test.ts` *(mới)* | `inventorySettingsSchema` + `operationalSettingsSchema` |

Số liệu hiện tại: **22 tệp test, 134 test case** — `npm test`, `npm run lint` đều xanh.

## 3. Các test mới trong lần bổ sung (test case: tên – bước – kết quả mong đợi)

Mỗi `it(...)` mang tên test case, trong thân có chú thích `Bước:` và `Kết quả mong đợi:`.

### UC03 — Manage Tables (`src/__tests__/tables.test.ts`)
1. S01 Tạo khu vực hợp lệ (sortOrder mặc định 0)
2. S02 Từ chối khu vực tên rỗng
3. S03 Tạo bàn hợp lệ (seats mặc định 2, sortOrder 0)
4. S04 Từ chối thiếu branchId / name rỗng
5. S05 Từ chối seats < 1
6. S06 Chỉ chấp nhận 4 trạng thái bàn
7. S07 Cashier bị chặn giải phóng bàn có đơn mở
8. S08 Owner/admin/manager được phép giải phóng bàn có đơn mở
9. S09 Bàn occupied không còn đơn mở luôn giải phóng được
10. S10 Bàn không phải occupied không cần kiểm tra đơn mở

### UC06 — Update Kitchen Status (`src/__tests__/kitchen.test.ts`)
1. S01 Chỉ chấp nhận 5 trạng thái bếp
2. S02 Chỉ hiển thị món thuộc đơn đã thanh toán
3. S03 Gắn đúng tên bàn / mã đơn / thời gian thanh toán
4. S04 Mặc định khi thiếu thông tin bàn/đơn
5. S05 Sắp xếp món theo thời gian thanh toán tăng dần

### UC07 — Dashboard/Report (`src/__tests__/dashboard.test.ts`)
1. S01 Xu hướng doanh thu chỉ cộng đơn paid
2. S02 Gom theo ngày
3. S03 Gom theo giờ + sắp xếp
4. S04 Phân loại menu theo danh mục + giảm dần
5. S05 Nhãn mặc định "Chưa phân loại" / "Khác"
6. S06 Gom kênh theo loại đơn
7. S07 Loại đơn không xác định → "Khác"
8. S08 Top sản phẩm: SL/doanh thu/giá vốn/lợi nhuận gộp
9. S09 Sắp xếp + giới hạn 10 món
10. S10 Tổng hợp chỉ số cốt lõi
11. S11 Đếm món hủy theo giai đoạn

### UC10 — Configure Settings (`src/__tests__/settings.test.ts`)
1. S01 Lưu thiết lập kho (boolean hợp lệ)
2. S02 Từ chối boolean sai kiểu
3. S03 Chấp nhận payload vận hành hợp lệ
4. S04 Từ chối chiết khấu > 100
5. S05 Từ chối giờ kinh doanh sai định dạng (regex `\d{2}:\d{2}`)
6. S06 Từ chối kênh bán thiếu tên
7. S07 Từ chối URL logo hóa đơn sai
8. S08 Yêu cầu danh sách kênh bán

### UC09 — Upload AI Documents (`src/__tests__/ai-documents.test.ts`)
1. S01 Chấp nhận tài liệu văn bản (content)
2. S02 Chấp nhận tài liệu binary
3. S03 Từ chối khi thiếu cả content lẫn binary
4. S04 Từ chối title/fileName rỗng hoặc quá dài
5. S05 Từ chối binary > 20MB
6. S06 Văn bản < 20 ký tự bị từ chối
7. S07 Ảnh chỉ cần ≥ 5 ký tự trích xuất
8. S08 Tài liệu > 500.000 ký tự bị từ chối
9. S09 Nội dung rỗng bị từ chối

## 4. Refactor để cho phép unit-test (không đổi hành vi)

| Tệp mới | Nội dung tách ra | Nguồn gốc |
|---|---|---|
| `src/lib/calculations/tables.ts` | `canFreeTable(role, currentStatus, hasOpenOrder)` + `FREE_TABLE_BYPASS_ROLES` | guard trong `src/server/actions/tables.ts` |
| `src/lib/calculations/kitchen.ts` | `transformKitchenItems(rows)` + types `KitchenBoardRow/KitchenBoardItem/KitchenItem` | map/filter/sort trong `src/server/queries/kitchen.ts` |
| `src/lib/calculations/dashboard.ts` | `buildRevenueTrend`, `buildMenuBreakdown`, `buildChannelBreakdown`, `buildTopProducts`, `computeDashboardCore`, `ORDER_TYPE_LABELS` | các khối gộp trong `src/server/queries/dashboard.ts` |
| `src/lib/ai/upload.ts` | `validateDocumentContentLength(content, mimeType)` | guard độ dài trong `src/server/actions/ai-documents.ts` |
| `src/lib/validation/upload.ts` | `uploadDocumentSchema` | schema cục bộ trong `src/server/actions/ai-documents.ts` |

Các action/query được sửa để gọi hàm thuần: `tables.ts`, `kitchen.ts`, `dashboard.ts`, `ai-documents.ts`.
Riêng `dashboard.ts` đổi biến destructure `rangeOrders`/`cancelledItems` thành `rangeOrdersRaw`/`cancelledItemsRaw`
rồi ép kiểu trước khi truyền vào các hàm thuần.

## 5. Lưu ý / cạm bẫy

- `businessDayStartTime` chỉ validate định dạng `HH:MM` (regex), KHÔNG check dải giờ, nên `25:99` vẫn hợp lệ về regex
  — test dùng `5:99` (giờ 1 chữ số) để kích hoạt lỗi định dạng.
- `uploadDocumentSchema` dùng `.refine` yêu cầu `content` HOẶC `binary`. `binary.data` giới hạn 20.000.000 ký tự base64.
- Trong `transformKitchenItems`, nhãn mặc định `"-"` cho `orderNumber` chỉ áp dụng khi `orders.order_number` là
  `null`/undefined (nullable), vì `??` không bắt rỗng (`""`).
- `npx tsc --noEmit` còn báo **1 lỗi có sẵn** trước đó: `Cannot find module 'pdf-parse'` tại
  `src/server/actions/ai-documents.ts` (đã tồn tại ở `HEAD`, không phải do refactor). Dự án dùng
  `next build` làm bước kiểm tra chính; lint và toàn bộ test đều xanh.