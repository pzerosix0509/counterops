# CounterOps - Store Operations MVP

CounterOps là ứng dụng quản lý vận hành cửa hàng / quán cafe / nhà hàng bằng tiếng Việt. Dự án tập trung vào các luồng thực tế của một cửa hàng nhỏ: bán hàng, bếp, bàn/phòng, thực đơn, kho hàng, báo cáo và nhập/xuất dữ liệu bằng Excel.

Stack hiện tại:

- Next.js 14 App Router
- React 18 + TypeScript
- Tailwind CSS + bộ component shadcn/ui viết trong `src/components/ui`
- Supabase Auth + Postgres + RLS
- Server Actions cho các thao tác nghiệp vụ
- ExcelJS cho import/export Excel
- AI provider qua API server-side: NVIDIA NIM / MiniMax-compatible / OpenAI
- Vitest cho unit tests

## Trạng Thái Hiện Tại

### Đã Có

- Đăng nhập bằng Supabase Auth.
- Onboarding tạo cửa hàng / chi nhánh.
- App shell với sidebar cố định, topbar, chọn chi nhánh.
- Phân quyền theo role: owner, admin, manager, cashier, reception, kitchen, staff.
- Dashboard doanh thu, đơn hàng, bàn đang dùng, biểu đồ doanh thu, nhóm món, kênh bán, hủy món/hóa đơn.
- POS bán hàng: chọn bàn / mang đi, thêm món, ghi chú, lưu đơn, thanh toán.
- Màn hình bếp: món chờ chế biến, đang làm, sẵn sàng.
- Quản lý bàn / phòng / khu vực.
- Quản lý thực đơn: nhóm món, món thường, món chế biến, bật/tắt bán.
- Quản lý kho: hàng hóa/nguyên liệu, tồn kho, phiếu nhập/xuất/điều chỉnh, lịch sử kho.
- Logic trừ tồn khi thanh toán:
  - Món thường trừ hàng kho bán trực tiếp theo mã hàng.
  - Món chế biến trừ nguyên liệu theo công thức active.
  - Chặn hoặc cho phép âm kho theo setting `allow_negative_inventory`.
  - Ghi lịch sử vào `inventory_movements`.
- Cài đặt kho: bật/tắt cho phép âm kho.
- Báo cáo cuối ngày: doanh thu, thanh toán, hủy đơn, chi tiết đơn đã thanh toán.
- Excel nền tảng:
  - Import preview + commit.
  - Download template.
  - Export workbook.
  - Tests cho parser/export/commit.
- UI Excel đã nối ở trang Thực đơn:
  - Import Excel.
  - Xuất Excel.
  - Tải file mẫu trong dialog import.
- UI Excel đã nối ở trang Kho hàng:
  - Import hàng kho.
  - Xuất Excel.
- UI Excel đã nối ở Báo cáo cuối ngày:
  - Xuất Excel.
- Realtime đã nối cho POS/Bếp qua Supabase Realtime publication.
- Hệ thống toast/notification đã nối cho các thao tác chính.
- AI trợ lý MVP:
  - Upload tài liệu text/Markdown/CSV/JSON và tự chia đoạn.
  - Hỏi đáp dữ liệu bán hàng/kênh bán/lãi lỗ bằng analytics RPC.
  - Hỗ trợ provider NVIDIA NIM (`minimaxai/minimax-m3`), MiniMax-compatible endpoint và OpenAI.
  - Hiển thị biểu đồ, nguồn trích dẫn, nguồn dữ liệu dạng metric/table và fallback nội bộ khi provider lỗi hoặc chưa cấu hình.

### Đang Hoàn Thiện

- Template/export Excel hiện ưu tiên header ASCII không dấu để tránh lỗi tương thích Excel cũ; có thể polish lại sang tiếng Việt có dấu.
- Upload ảnh món/hàng kho chưa kết nối Supabase Storage.
- Tìm kiếm tài liệu AI hiện là keyword search; semantic search bằng embedding/pgvector là bước nâng cấp tiếp theo.
- Chưa có module nhân sự, khách hàng/CRM, công nợ nâng cao.

## Cấu Trúc Chính

```text
src/
  app/
    (auth)/
      login/
      onboarding/
    (app)/
      ai/
      dashboard/
      pos/
      kitchen/
      tables/
      menu/
      inventory/
      reports/end-of-day/
      settings/
    api/
      ai/chat/
      inventory/movements/

  components/
    app-shell/
    common/
      excel-download-button.tsx
      excel-import-preview.tsx
      excel-import.tsx
      states.tsx
    ai/
    dashboard/
    inventory/
    kitchen/
    menu/
    pos/
    reports/
    settings/
    tables/
    ui/

  lib/
    auth/permissions.ts
    calculations/
    ai/
    date/ranges.ts
    excel/workbook.ts
    supabase/
    utils/
    validation/

  server/
    actions/
      eod.ts
      ai-documents.ts
      excel.ts
      inventory.ts
      menu.ts
      onboarding.ts
      orders.ts
      settings.ts
      tables.ts
    excel/
      exports.ts
      imports.ts
      templates.ts
    queries/
      ai.ts
      settings.ts

  types/
    ai.ts
    database.ts

supabase/
  migrations/
  seed.sql
  reset_demo.sql
```

## Cài Đặt

Yêu cầu:

- Node.js 18+
- npm
- Supabase project

### 1. Cài dependency

```bash
npm install
```

### 2. Tạo file môi trường

Tạo `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# AI provider. Use one of: nvidia, minimax, openai
AI_PROVIDER=nvidia

# NVIDIA NIM / Integrate API for MiniMax M3
NVIDIA_API_KEY=...
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=minimaxai/minimax-m3

# Alternative: MiniMax/OpenAI-compatible endpoint
MINIMAX_API_KEY=...
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_MODEL=MiniMax-M3

# Alternative: OpenAI Responses API
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

Lưu ý: `SUPABASE_SERVICE_ROLE_KEY` chỉ được dùng server-side. Không thêm prefix `NEXT_PUBLIC_`.
`OPENAI_API_KEY`, `NVIDIA_API_KEY` hoặc `MINIMAX_API_KEY` là tùy chọn; nếu chưa có, trang AI vẫn trả lời bằng fallback dựa trên dữ liệu nội bộ.

### 3. Chạy migration

Chạy lần lượt các migration trong Supabase SQL Editor hoặc bằng CLI/psql:

```text
supabase/migrations/0001_init.sql
supabase/migrations/0002_fix_has_org_role.sql
supabase/migrations/0003_recover_memberships.sql
supabase/migrations/0004_add_order_items_created_at.sql
supabase/migrations/0005_add_inventory_settings.sql
supabase/migrations/0006_add_realtime_publication.sql
supabase/migrations/0007_add_default_takeaway_channels.sql
supabase/migrations/0008_add_operational_settings.sql
supabase/migrations/0009_add_ai_assistant.sql
```

Migration quan trọng gần đây:

- `0004_add_order_items_created_at.sql`: thêm `created_at` cho `order_items`.
- `0005_add_inventory_settings.sql`: thêm `organizations.allow_negative_inventory`.
- `0006_add_realtime_publication.sql`: bật publication cho POS/Bếp realtime.
- `0008_add_operational_settings.sql`: thêm nhóm setting vận hành/kho/bếp/POS.
- `0009_add_ai_assistant.sql`: thêm bảng tài liệu AI, chunk tài liệu và RPC analytics scoped theo organization/branch.

### 4. Tạo user và dữ liệu demo

1. Tạo user trong Supabase Auth.
2. Đăng nhập vào app và chạy onboarding, hoặc seed thủ công organization/branch/membership.
3. Có thể dùng `supabase/seed.sql` hoặc `supabase/reset_demo.sql` để tạo dữ liệu demo nếu đã thay placeholder UUID phù hợp.

### 5. Chạy dev server

```bash
npm run dev
```

Mở:

```text
http://localhost:3000
```

## Scripts

```bash
npm run dev         # chạy dev server
npm run build       # build production
npm run start       # chạy production server
npm run lint        # next lint
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
```

Trước khi push code nên chạy:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Module Nghiệp Vụ

### POS

- Chọn chế độ tại quán / mang đi.
- Chọn bàn hoặc tạo đơn mang đi.
- Thêm món, tăng/giảm số lượng, ghi chú.
- Lưu đơn.
- Thanh toán.
- Khi thanh toán, server tính lại tổng tiền và trừ tồn kho nếu đơn chưa từng bị trừ.

### Bếp

- Hiển thị món cần chế biến.
- Chuyển trạng thái: chờ chế biến, đang làm, sẵn sàng.
- Cho phép cập nhật món của đơn đã thanh toán nếu đơn chưa bị hủy/hoàn.

### Thực Đơn

- Quản lý nhóm món.
- Tạo món thường hoặc món chế biến.
- Bật/tắt trạng thái bán.
- Import/Export Excel đã nối vào UI.

### Kho Hàng

- Tạo hàng hóa/nguyên liệu.
- Theo dõi tồn kho và định mức thấp.
- Lập phiếu nhập/xuất/điều chỉnh.
- Xem lịch sử kho.
- Chặn hoặc cho phép âm kho theo setting.
- Import/Export Excel đã nối vào UI.

### Báo Cáo

- Dashboard theo khoảng thời gian: hôm nay, hôm qua, 7 ngày, tháng này, tháng trước.
- Báo cáo cuối ngày theo ngày.
- Export Excel báo cáo cuối ngày đã nối vào UI.

## Excel Import/Export

Dependency:

```text
exceljs
```

Các file chính:

```text
src/lib/excel/workbook.ts
src/lib/validation/excel-schemas.ts
src/lib/validation/row.ts
src/server/actions/excel.ts
src/server/excel/templates.ts
src/server/excel/imports.ts
src/server/excel/exports.ts
src/components/common/excel-import-preview.tsx
src/components/common/excel-download-button.tsx
```

Luồng import:

1. Người dùng mở dialog import.
2. Tải template nếu cần.
3. Chọn file `.xlsx`.
4. Server parse workbook và validate từng dòng.
5. UI hiển thị preview dòng hợp lệ và lỗi từng dòng.
6. Người dùng xác nhận commit.
7. Server re-validate preview rồi mới ghi DB.

Luồng export:

1. Client gọi server action.
2. Server query dữ liệu.
3. Server build workbook bằng ExcelJS.
4. Trả base64 + MIME + filename.
5. Client tải file xuống.

Lưu ý kỹ thuật:

- Không import các module dùng ExcelJS ở top-level trong server action. Dùng dynamic import trong từng action để tránh làm `next build` out-of-memory.
- Không parse Excel ở client.
- Service role chỉ nằm trong server code.

## Phân Quyền

| Module | owner | admin | manager | cashier | reception | kitchen | staff |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | Có | Có | Có | Xem | Không | Không | Không |
| POS | Có | Có | Có | Có | Tạo đơn | Không | Không |
| Bếp | Có | Có | Có | Không | Không | Có | Không |
| Bàn/phòng | Có | Có | Có | Có | Có | Không | Không |
| Thực đơn | Có | Có | Có | Xem | Xem | Xem | Không |
| Kho | Có | Có | Có | Xem | Không | Không | Không |
| Báo cáo | Có | Có | Có | Xem | Không | Không | Không |
| AI trợ lý | Có | Có | Có | Có | Không | Không | Không |
| Cài đặt | Có | Có | Có | Không | Không | Không | Không |

Các quyền chính nằm trong:

```text
src/lib/auth/permissions.ts
```

## Bảo Mật

- Supabase RLS bật cho các bảng nghiệp vụ.
- Mỗi bảng chính có `organization_id`.
- Helper SQL: `is_org_member`, `has_org_role`, `has_branch_access`.
- Server actions luôn gọi `requireRole`.
- Không expose service role key ra client.
- Các thao tác quan trọng ghi `audit_logs`.
- Đơn đã thanh toán không cho sửa như đơn mở.

## Tests

Test hiện có:

- Date range.
- Order calculations.
- Inventory calculations.
- Validation schemas.
- Excel parser.
- Excel export.
- Excel commit.
- AI document chunking/search utilities.

Chạy:

```bash
npm run test
```

## Roadmap Gần Nhất

Ưu tiên cao:

1. Manual test AI với provider thật: NVIDIA/MiniMax/OpenAI, fallback reason, nguồn trích dẫn, upload tài liệu.
2. Thêm semantic search cho tài liệu AI bằng embedding + Supabase pgvector.
3. Thiết kế AI dashboard spec renderer để AI tạo dashboard bằng JSON an toàn thay vì HTML raw.
4. Manual test toàn bộ flow Excel trên Supabase thật: tải mẫu, import preview, commit, export.
5. Manual test flow POS thanh toán trước -> Bếp realtime -> Đã phục vụ -> bàn về trống.

Ưu tiên tiếp theo:

1. Polish template Excel sang tiếng Việt có dấu đầy đủ trong cả instruction sheet.
2. Upload ảnh món/hàng kho qua Supabase Storage.
3. Hoàn tiền / trả hàng / công nợ nâng cao.
4. Quản lý nhân sự và ca làm.
5. Khách hàng/CRM.

## Deploy

Khuyến nghị deploy frontend trên Vercel, database/auth trên Supabase.

Checklist:

- Set đủ env vars trên Vercel.
- Chạy migration trên Supabase production.
- Kiểm tra RLS policies.
- Chạy `npm run build` local trước khi deploy.
- Không log service role key.

## Tài Liệu Tham Khảo

- Next.js App Router: https://nextjs.org/docs/app
- Supabase Next.js: https://supabase.com/docs/guides/getting-started/quickstarts/nextjs
- Supabase SSR Auth: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- shadcn/ui: https://ui.shadcn.com/docs
- ExcelJS: https://github.com/exceljs/exceljs
- OpenAI Responses API: https://platform.openai.com/docs/guides/text?api-mode=responses
- NVIDIA Integrate API: https://integrate.api.nvidia.com
