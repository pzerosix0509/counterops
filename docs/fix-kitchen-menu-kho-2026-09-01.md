# Fix bếp, thực đơn, kho (2026-09-01)

Nhánh: `fix/kitchen-menu-inventory`.
App: `counterops`.

---

## 1. Hiện trạng (trước khi sửa)

### Bếp

- Đơn có cả món **chế biến** và món **thường** (`kitchen_status = not_required`) chỉ hiện món chế biến trên thẻ đơn.
- Ví dụ thực tế: đặt món C (regular) + D (prepared), tab Chờ chế biến chỉ thấy D.
- Nút **Đã phục vụ** chỉ render ở tab **Sẵn sàng**, không nằm ở tab Chờ chế biến.
- Sau khi bấm **Sẵn sàng**, UI chờ `router.refresh()` mới cập nhật trạng thái; user phải tự chuyển tab mới thấy **Đã phục vụ** (cảm giác “sau một lúc mới có”).

### POS

- Thanh toán tại quán: kiểm tra bàn `occupied` chạy **sau** khi tạo đơn, nên bàn vừa gán đơn đã bị coi là có khách và có thể chặn thanh toán.

### Kho

- Cột **Lịch sử** mở dialog phiếu kho; không có luồng sửa tên, giá, vai trò, xóa hàng trên UI.
- Xóa hàng dùng trong công thức món chế biến: chưa liệt kê món bị ảnh hưởng.
- Search chỉ match **tên** (`ilike name`); không match mã hàng.
- Gõ tìm không lọc client-side trên danh sách đang hiển thị; URL `?q=` không được xóa khi ô trống.

### Thực đơn

- Ô tìm có filter client-side nhưng form không ghi URL (`?q=`) và không nút Lọc.
- Chỉ match tên, không match mã món.

---

## 2. Đã sửa gì

| Khu vực | Vấn đề | Kết quả mong đợi |
|---------|--------|------------------|
| Bếp | Thiếu món thường trên thẻ đơn | Hiện đủ món cùng đơn; món thường ghi “Không cần chế biến” |
| Bếp | Trễ thấy **Đã phục vụ** | Bấm Sẵn sàng → chuyển tab Sẵn sàng ngay; trạng thái optimistic |
| POS | Chặn thanh toán nhầm trên bàn occupied | Kiểm tra bàn trước khi tạo đơn |
| Kho | Không sửa/xóa hàng | Nút **Chỉnh sửa**: tên, giá, vai trò, ngưỡng cảnh báo, xóa |
| Kho | Xóa nguyên liệu đang trong BOM | Banner liệt kê món chế biến; disable Xóa; link sang Thực đơn |
| Kho | Search chỉ theo tên | Tìm tên + mã; lọc client khi gõ; Lọc sync URL `?q=` |
| Thực đơn | Search yếu | Tìm tên + mã; nút Lọc; sync URL `?q=` |

---

## 3. Bằng cách nào

### 3.1 Bếp – đủ món trên thẻ đơn

**File:** `src/server/queries/kitchen.ts`, `src/lib/calculations/kitchen.ts`, `src/components/kitchen/kitchen-board.tsx`.

- Query món `pending/cooking/ready`, rồi lấy thêm `not_required` cùng `order_id`.
- `filterKitchenItemsForTab`: tab Chờ chế biến giữ món thường kèm món chế biến cùng đơn.
- Setting `showRegularItemsInKitchen`: tab Chờ cũng hiện đơn chỉ có món thường.

### 3.2 Bếp – nút Đã phục vụ xuất hiện muộn

**Nguyên nhân:** Nút **Đã phục vụ** chỉ thuộc tab Sẵn sàng; sau **Sẵn sàng** user vẫn ở tab Chờ cho đến khi refresh + chuyển tab thủ công.

**File:** `src/components/kitchen/kitchen-board.tsx`.

- `displayItems`: overlay `optimisticIds` lên `kitchen_status` ngay khi bấm.
- Khi bấm **Sẵn sàng** (và không bật autoMarkServedOnReady): `setTab("ready")`.
- Xóa optimistic khi props server khớp trạng thái.

### 3.3 POS – thanh toán bàn

**File:** `src/components/pos/pos-workspace.tsx`.

- Di chuyển check `table.status === "occupied"` lên trước `persistOrder()`.

### 3.4 Kho – chỉnh sửa / xóa

**File:** `src/server/actions/inventory.ts`, `src/components/inventory/inventory-manager.tsx`, `src/lib/validation/schemas.ts`.

- `updateInventoryItem`, `deleteInventoryItem`, `getInventoryDeleteBlockers`.
- Dialog Chỉnh sửa thay cột Lịch sử; lịch sử phiếu vẫn trong dialog Nhập/xuất.

### 3.5 Kho – chặn xóa nguyên liệu trong BOM

**File:** `src/server/queries/inventory.ts` (`listPreparedProductsUsingIngredient`), `src/lib/calculations/inventory.ts` (`buildInventoryDeleteConflictMessage`).

- Server trả `fieldErrors.affectedProducts`.
- UI banner vàng + link `/menu` khi mở dialog sửa hàng bị chặn.

### 3.6 Thực đơn – search

**File:** `src/components/menu/menu-manager.tsx`, `src/server/queries/menu.ts`.

- Form submit → `router.replace('/menu?q=...')`.
- Filter client + server: `name` hoặc `code` (ilike).
- Placeholder: “Tìm theo tên hoặc mã món”; nút **Lọc**.

### 3.7 Kho – search

**File:** `src/components/inventory/inventory-manager.tsx`, `src/server/queries/inventory.ts`.

- Form submit → `router.replace('/inventory?q=...')`; xóa `?q` khi ô trống.
- Server + client: `name` hoặc `code` (ilike / includes).
- Placeholder: “Tìm theo tên hoặc mã hàng”; empty state phân biệt “chưa có hàng” vs “không khớp”.
- Xuất Excel dùng cùng `listInventoryItems(search)` nên export theo bộ lọc hiện tại.

---

## 4. Test

- `src/__tests__/kitchen.test.ts` – companion items, tab filter.
- `src/__tests__/inventory.test.ts` – message xóa bị chặn.
- `src/__tests__/login-menu-inventory.test.ts` – `inventoryItemUpdateSchema`.
- Full suite: 337 tests pass (sau các thay đổi trên nhánh).

---

## 5. Kiểm thử tay

1. **Bếp:** Đơn paid gồm món regular + prepared → thẻ hiện cả hai; bấm Sẵn sàng → tab Sẵn sàng + **Đã phục vụ** ngay.
2. **Kho:** Chỉnh sửa giá vốn; thử xóa nguyên liệu đang trong BOM → thấy danh sách món; gõ mã hoặc tên → Lọc → URL có `?q=`.
3. **Thực đơn:** Gõ mã hoặc tên → Lọc → URL có `?q=`.
