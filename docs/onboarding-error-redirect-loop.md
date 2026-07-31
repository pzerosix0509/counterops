# Vòng lặp redirect `/onboarding?error=missing_branch` ↔ `/dashboard`

## Tóm tắt

Khi user đã có membership (thuộc cửa hàng) nhưng hệ thống không xác định được chi nhánh hoạt động (`branchId`), app redirect giữa `/onboarding?error=missing_branch` và `/dashboard` liên tục, khiến trình duyệt reload không dừng và không thể sử dụng.

**Mức độ:** Medium  
**Trạng thái:** Đã xử lý

---

## Mô tả vấn đề

### Triệu chứng

- Tab trình duyệt nhấp nháy / reload liên tục
- DevTools → Network hiển thị chuỗi request **307** lặp lại giữa hai URL
- Không hiển thị trang lỗi cho user

### Điều kiện tái hiện

User thỏa **cả hai** điều kiện:

1. Đã đăng nhập và có **membership active** (đã thuộc ít nhất một cửa hàng)
2. `getActiveBranchId()` trả về `null` — thường gặp khi cửa hàng **chưa có chi nhánh hoạt động** trong database

### Nguyên nhân gốc

Hai luồng redirect mâu thuẫn:

```
/dashboard
  → requireActiveContext() thấy thiếu branchId
  → redirect /onboarding?error=missing_branch

/onboarding?error=missing_branch
  → thấy memberships.length > 0
  → redirect /dashboard

→ lặp vô hạn
```

Query `?error=*` không được đọc hay hiển thị; trang onboarding chỉ kiểm tra membership rồi đẩy về dashboard.

### File liên quan (trước khi sửa)

| File | Vai trò |
|------|---------|
| `src/lib/auth/permissions.ts` | `requireActiveContext()` redirect `/onboarding?error=missing_branch` |
| `src/app/(auth)/onboarding/page.tsx` | Redirect `/dashboard` khi đã có membership |
| `src/app/(app)/dashboard/page.tsx` | Gọi `requireActiveContext()` khi load |

---

## Cách tái hiện (trước khi sửa)

1. Đăng nhập bằng **tài khoản test** (xem mục bên dưới)
2. Mở DevTools → Network, bật **Preserve log**
3. Truy cập một trong các URL:
   - `http://localhost:3000/dashboard`
   - `http://localhost:3000/onboarding?error=missing_branch`
4. Quan sát reload liên tục giữa hai URL trên

---

## Giải pháp

### Hướng tiếp cận

Tách trang lỗi truy cập ra route riêng, **không** dùng `/onboarding` làm đích redirect khi user đã có membership.

### Thay đổi chính

1. **Trang lỗi mới:** `/access-error?code=<mã_lỗi>`
   - Hiển thị tiêu đề + mô tả tiếng Việt theo mã lỗi
   - Nút **Về trang chủ** → `/`
   - Không redirect thêm → chặn vòng lặp

2. **Cập nhật redirect trong `permissions.ts`:**
   - `missing_branch` → `/access-error?code=missing_branch`
   - `forbidden` → `/access-error?code=forbidden`

3. **URL cũ tương thích ngược:**
   - `/onboarding?error=<code>` → chuyển tiếp `/access-error?code=<code>`
   - Không redirect về `/dashboard` khi có query `error`

4. **Middleware:** thêm `/access-error` vào nhóm route auth công khai

### Mã lỗi hỗ trợ

| Mã | Tiêu đề | Khi nào xảy ra |
|----|---------|----------------|
| `missing_branch` | Chưa có chi nhánh hoạt động | Có org/membership nhưng không có `branchId` |
| `forbidden` | Không có quyền truy cập | User không đủ role cho chức năng |
| *(không xác định)* | Đã xảy ra lỗi | Mã `code` không hợp lệ |

### File đã thêm / sửa

| File | Thay đổi |
|------|----------|
| `src/lib/errors/codes.ts` | Định nghĩa mã lỗi và nội dung hiển thị |
| `src/components/errors/access-error-card.tsx` | UI card lỗi truy cập |
| `src/app/(auth)/access-error/page.tsx` | Route `/access-error` |
| `src/lib/auth/permissions.ts` | Đổi đích redirect lỗi |
| `src/app/(auth)/onboarding/page.tsx` | Chuyển tiếp `?error=` sang `/access-error` |
| `src/lib/supabase/middleware.ts` | Cho phép route `/access-error` |
| `src/__tests__/access-error.test.ts` | Test `resolveAccessError()` |

### Luồng sau khi sửa

```
/dashboard (thiếu branchId)
  → /access-error?code=missing_branch
  → hiển thị trang lỗi + nút về trang chủ
  → dừng (không loop)
```

---

## Kiểm tra sau khi sửa

1. Đăng nhập tài khoản test bên dưới
2. Mở `http://localhost:3000/dashboard`
3. **Kỳ vọng:** Trang *"Chưa có chi nhánh hoạt động"*, không reload liên tục
4. Bấm **Về trang chủ** → redirect `/` → `/login` hoặc `/dashboard` tùy session

---

## Tài khoản test (giữ lại trong DB)

Tài khoản này được tạo để tái hiện lỗi: có org + membership owner, **không có chi nhánh**.

| Trường | Giá trị |
|--------|---------|
| Email | `test-loop@counterops.local` |
| Mật khẩu | `TestLoop123!` |
| User ID | `b612f09e-b0fe-4db7-b3d4-6c713850863b` |
| Organization ID | `ac1b9615-a2b3-4d62-8bd3-c7b91959fbfb` |
| Tên org | Test Loop Org |
| Số chi nhánh | 0 |
| Role | `owner` |

> **Lưu ý:** Không xóa tài khoản này — dùng để regression test sau này.

---

## Ghi chú thêm

- Trang `src/app/error.tsx` và `src/app/not-found.tsx` xử lý **runtime error** và **404**, không liên quan trực tiếp đến bug redirect loop này.
- Tài khoản production thông thường (có chi nhánh trong DB) có thể chỉ thấy redirect một chiều `/onboarding?error=...` → `/dashboard` mà không loop; vòng lặp đầy đủ cần trạng thái **membership có, branch không có**.
