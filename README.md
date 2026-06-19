# Quản lý cửa hàng (Store Operations MVP)

Ứng dụng vận hành cửa hàng / nhà hàng / quán cafe tiếng Việt, xây dựng với Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Supabase (Postgres + Auth + RLS).

Tài liệu gốc: `../requirements.txt`, `../docs/SDD.md`, `../docs/database-schema.md`, `../docs/api-and-actions.md`, `../docs/mvp-roadmap.md`, `../docs/ui-wireframes.md`, `../docs/technical-architecture.md`, `../docs/ai-coding-prompt.md`.

## Phạm vi MVP đã build

- **Phase 0 (Foundation)**: xác thực Supabase, tạo cửa hàng / chi nhánh, membership + RLS, app shell, sidebar / topbar / branch selector.
- **Phase 1 (Core operations)**: quản lý thực đơn (món thường / món chế biến với công thức), kho hàng (mặt hàng, tồn, lập phiếu), khu vực / bàn, POS tạo đơn + thanh toán, màn hình bếp.
- **Phase 2 (Reporting)**: trừ tồn kho theo công thức, dashboard doanh thu / đơn / món bán chạy / kênh / hủy, báo cáo cuối ngày với phân tích hình thức thanh toán.

## Công nghệ

- Next.js 14 (App Router, Server Components / Server Actions)
- TypeScript, Tailwind CSS, lucide-react, recharts
- shadcn/ui (được viết thủ công trong `src/components/ui/*`)
- Supabase: Postgres + Auth + RLS (chuẩn bị cho Storage / Realtime)

## Cấu trúc thư mục

```
src/
  app/
    (auth)/login, (auth)/onboarding
    (app)/{dashboard,pos,kitchen,tables,menu,inventory,reports/end-of-day,settings}
    api/inventory/movements
  components/{ui,app-shell,dashboard,menu,inventory,pos,kitchen,tables,reports,common}
  lib/
    auth/permissions.ts        # requireRole, canManage..., getActiveMembership
    calculations/{orders,inventory}.ts
    date/ranges.ts
    supabase/{client,server,admin,middleware}.ts
    utils/{format,action-result}.ts
    validation/schemas.ts      # zod schemas
  server/
    actions/{onboarding,menu,inventory,tables,orders,eod}.ts
    queries/{dashboard,menu,inventory,orders,tables,kitchen,eod}.ts
  types/database.ts            # Database TS types (manually maintained)
supabase/
  migrations/0001_init.sql     # schema + RLS
  seed.sql                     # demo data
```

## Thiết lập môi trường

Yêu cầu: Node.js 18+, tài khoản Supabase.

1. Cài dependency:
   ```bash
   npm install
   ```
2. Tạo project Supabase (https://supabase.com) hoặc dùng `supabase start` cục bộ nếu đã cài Supabase CLI.
3. Sao chép `.env.example` thành `.env.local` và điền:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Chạy migration trong Supabase SQL editor hoặc bằng CLI:
   ```bash
   psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
   ```
5. Tạo một user trong Supabase Auth (email + password), copy `auth.users.id` của user đó.
6. Tạo organization + branch + owner membership bằng cách đăng nhập và làm theo form `/onboarding`, hoặc seed bằng tay:
   ```sql
   -- Thay :user_id, :organization_id, :branch_id bằng uuid thực tế
   insert into organizations (id, name, slug) values (:organization_id, 'Quán Cafe Demo', 'cafe-demo');
   insert into branches (id, organization_id, name) values (:branch_id, :organization_id, 'Chi nhánh trung tâm');
   insert into memberships (organization_id, branch_id, user_id, role) values (:organization_id, null, :user_id, 'owner');
   ```
7. Chạy file seed với placeholder tương ứng:
   ```bash
   sed -e "s/:owner_user_id/$USER_ID/" -e "s/:organization_id/$ORG_ID/" -e "s/:branch_id/$BRANCH_ID/" \
     supabase/seed.sql | psql "$DATABASE_URL"
   ```
8. Khởi động dev server:
   ```bash
   npm run dev
   ```
   Truy cập http://localhost:3000.

## Lệnh tiện ích

```bash
npm run dev         # khởi động dev server
npm run build       # build production
npm run start       # chạy production server
npm run lint        # next lint
npm run typecheck   # tsc --noEmit
npm run test        # vitest run (unit tests)
```

## Vai trò và quyền

| Module        | owner | admin | manager | cashier | reception | kitchen | staff |
|---------------|-------|-------|---------|---------|-----------|---------|-------|
| Dashboard     | ✅    | ✅    | ✅      | xem     | -         | -       | -     |
| POS           | ✅    | ✅    | ✅      | ✅      | tạo đơn   | -       | -     |
| Bếp           | ✅    | ✅    | ✅      | -       | -         | ✅      | -     |
| Bàn / phòng   | ✅    | ✅    | ✅      | ✅      | ✅        | -       | -     |
| Thực đơn      | ✅    | ✅    | ✅      | xem     | xem       | xem     | -     |
| Kho           | ✅    | ✅    | ✅      | xem     | -         | -       | -     |
| Báo cáo      | ✅    | ✅    | ✅      | xem     | -         | -       | -     |
| Cài đặt      | ✅    | ✅    | ✅      | -       | -         | -       | -     |

Mọi thao tác nhạy cảm phải chạy qua server action với `requireRole`; RLS bổ sung lớp bảo vệ cấp database.

## Kiến trúc bảo mật

- Không bao giờ dùng `SUPABASE_SERVICE_ROLE_KEY` ở client; chỉ import trong server actions khi cần thiết.
- Mọi bảng nghiệp vụ có `organization_id`; RLS dùng helper `is_org_member`, `has_org_role`, `has_branch_access`.
- Đơn đã thanh toán bị khóa (chỉ luồng hoàn tiền / admin mới thay đổi).
- Mỗi lần trừ tồn kho đều tạo dòng `inventory_movements`.
- Hủy món, hủy đơn, thanh toán đều ghi `audit_logs`.

## Tests

- Unit tests cho `lib/calculations/*` (subtotal / discount / tax / fee, công thức recipe, findShortages).
- Tích hợp cho `payOrder` / `createOrUpdateOrder` cần Supabase thật nên nằm ngoài phạm vi tự động hóa của môi trường dev này.

## Giới hạn đã biết

- Chưa hỗ trợ import / export Excel (sẽ làm ở phase 2 tiếp theo).
- Chưa có trang staff / khách hàng / AI (theo kế hoạch, giai đoạn 3-4).
- Realtime chưa bật; kitchen / POS đang dùng `router.refresh()` sau mỗi thao tác.
- Storage / upload ảnh chưa kết nối.
- Đăng nhập dùng email / password. OAuth để dành cho giai đoạn sau.
- Tests tích hợp với Supabase thật cần CLI `supabase` hoặc test database; trong môi trường này chỉ chạy unit tests.
- Trong dev, nếu Supabase chưa sẵn sàng, các server action sẽ báo lỗi rõ ràng về biến môi trường.

## Tài liệu tham chiếu

- https://nextjs.org/docs/app
- https://supabase.com/docs/guides/getting-started/quickstarts/nextjs
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://ui.shadcn.com/docs/installation/next
