# Users Flow — AI Chatbot

> Mô tả hành trình người dùng khi tương tác với trợ lý AI phân tích dữ liệu trong CounterOps
> (cafe / nhà hàng). Tài liệu này tập trung vào **phía người dùng cuối** — những gì họ
> thấy, nhập, nhận được và làm tiếp theo.

Tham chiếu kỹ thuật: `docs/ai-context.md`. Tham chiếu UI: `src/components/ai/ai-assistant.tsx`.

---

## 1. Các vai trò có thể dùng chatbot

Chatbot chỉ hiển thị cho user có quyền `canViewReports` (`src/lib/auth/permissions.ts`).
Trong thực tế, các vai trò sau thường dùng:

| Vai trò        | Mục đích chính                                          |
|----------------|---------------------------------------------------------|
| `owner`/`admin`| Xem tổng quan, dashboard, ra quyết định chiến lược      |
| `manager`      | So sánh kỳ, chẩn đoán doanh thu, kiểm tra tồn kho      |
| `reception`    | Tra cứu nhanh doanh thu, đơn theo ca                   |
| `cashier`      | Top món, kênh bán chạy trong ngày                      |

`kitchen`, `staff`, `cashier` (nếu thiếu quyền) sẽ không thấy nút mở chatbot.

---

## 2. Bước 0 — Mở chatbot

1. User đăng nhập và hoàn tất onboarding (đã có `organization` + `branch`).
2. Trên thanh điều hướng / menu bên trái có biểu tượng **Bot** (icon `Bot`).
3. Click → panel chatbot trượt vào (lazy-load component `ai-assistant-lazy.tsx`).
4. Lần đầu mở: hiển thị 4 **prompt gợi ý**:
   - "Doanh thu 7 ngày qua thế nào?"
   - "Top món có lãi tốt nhất tháng này?"
   - "Tạo dashboard quản trị 7 ngày qua"
   - "Tóm tắt tài liệu đã upload liên quan đến kho."
5. Có thể click trực tiếp vào gợi ý để gửi, hoặc gõ câu hỏi mới.

---

## 3. Bước 1 — Đặt câu hỏi

User có thể hỏi theo 4 nhóm:

### 3.1. Hỏi về số liệu (deterministic)
- Doanh thu / lợi nhuận / số đơn trong một kỳ.
- Xu hướng theo ngày / tuần / tháng.
- So sánh kỳ này vs kỳ trước.
- Top món, top kênh, theo nhóm.
- Tồn kho / hết hàng / âm kho.

Ví dụ: *"Doanh thu tuần này?"*, *"So với tuần trước thế nào?"*, *"Món nào bán chạy tháng này?"*.

### 3.2. Tạo dashboard
- Câu có chứa `dashboard` / `bảng điều khiển` / `KPI` ở đầu câu.
- Hệ thống sinh **6 biểu đồ chuẩn** (doanh thu, top món, kênh, tồn kho…).

### 3.3. Hỏi ngoài phạm vi
- Chào hỏi, hỏi khả năng, hỏi kiến thức chung.
- Tra cứu web (giá vàng, tin tức) — nếu câu chứa tín hiệu rõ.
- Tìm trong **tài liệu đã upload**.

### 3.4. Đính kèm ảnh
- Click icon **Upload** (ảnh), chọn file `jpeg/png/webp/gif`, ≤ 4 MB base64.
- Ảnh được đọc bằng vision model → trích văn bản / mô tả → xử lý như tài liệu.

### 3.5. Cách gõ
- Ngôn ngữ: tiếng Việt (khuyến nghị) hoặc tiếng Anh.
- Có thể viết tắt: *"dt 7 ngay qua"*, *"top mon thang nay"*.
- Mốc thời gian có thể tương đối: "hôm nay", "tuần này", "tháng trước", "quý này".

---

## 4. Bước 2 — Hệ thống xử lý (user thấy gì)

Sau khi bấm **Send**, user thấy:

1. Tin nhắn của họ hiện ra bên phải (bubble người dùng).
2. Tin nhắn trả lời tạm: **"Đang phân tích…"** kèm spinner.
3. Nếu stream được bật (`?stream=true`), các dòng **progress** lần lượt hiện ra:
   - "Đang xác định câu hỏi…"
   - "Đang lấy dữ liệu bán hàng…"
   - "Đang đánh giá chất lượng dữ liệu…"
   - "Đang sinh câu trả lời…"
4. Khi xong → câu trả lời cuối + bảng số liệu / biểu đồ (nếu có) thay thế dòng tạm.

Nếu lỗi → hiện thông báo ngắn ("Không truy cập được AI, đang thử lại…"). Không bao giờ
hiển thị stack trace.

---

## 5. Bước 3 — Đọc câu trả lời

Một câu trả lời hoàn chỉnh có **4 phần**:

### 5.1. Văn bản trả lời (`answer`)
- Tóm tắt ngắn gọn, tiếng Việt.
- Có thể chứa con số, phần trăm thay đổi, cảnh báo.
- Kết thúc bằng **trích dẫn nguồn** dạng `[S1]`, `[S2]` (tương ứng trong bảng SOURCES).

### 5.2. Gạch đầu dòng (`bullets`)
- Tối đa 10 dòng, mỗi dòng ≤ 800 ký tự.
- Thường là các điểm chính: doanh thu, tăng/giảm, top món, cảnh báo.

### 5.3. SOURCES (bảng nguồn)
Mỗi nguồn có:
- **Tiêu đề** (metric / tài liệu / URL).
- **Loại**: `database` / `document` / `web`.
- **Số liệu** dạng key-value hoặc bảng 4 cột (tối đa 4 dòng đầu).
- Với `web`: có link ra ngoài.
- Với `document`: hiển thị đoạn trích ngắn.

### 5.4. Biểu đồ / Dashboard (nếu có)
- Vẽ bằng `ChartSpecRenderer` (line / bar / pie).
- Với dashboard: `AiDashboardRenderer` hiển thị lưới nhiều biểu đồ + nút **Save as template**.

---

## 6. Bước 4 — Phản hồi & thao tác tiếp

Sau mỗi câu trả lời, user có thể:

### 6.1. Đánh giá câu trả lời
- Click 👍 (thumbs up) hoặc 👎 (thumbs down) dưới mỗi bubble assistant.
- Server action `submitAiMessageFeedback` lưu `runId` + điểm → telemetry.

### 6.2. Hỏi tiếp (follow-up)
- Không cần lặp lại mốc thời gian: chatbot **kế thừa range** từ câu trước (state.memory).
- Ví dụ:
  > Câu 1: *"Doanh thu tháng này?"*
  > Câu 2: *"So với tháng trước thì sao?"* → tự hiểu cùng metric, so sánh tự động.
- Nếu câu mơ hồ, hệ thống **hỏi lại** thay vì đoán (clarification).

### 6.3. Upload / quản lý tài liệu
- Click icon **Upload** → chọn file → server action `uploadAiDocument`.
- Sau khi upload, hỏi: *"Tóm tắt tài liệu vừa upload"* hoặc *"Tìm thông tin X trong tài liệu"*.
- Có danh sách tài liệu đã upload với nút xóa (`deleteAiDocument`).

### 6.4. Lưu dashboard thành template
- Khi chatbot trả về `dashboard`, có nút **Save**.
- Đặt tên → server action `saveAiDashboardTemplate` → lưu vào DB.
- Mở lại từ menu template (ngoài phạm vi chatbot, vào trang Dashboards).

### 6.5. Quản lý phiên chat
Trên header panel có:
- **Plus** → tạo phiên mới.
- **History** → danh sách phiên (mới nhất trước).
  - **Pencil** → đổi tên phiên (`renameAiChatSession`).
  - **Pin / PinOff** → ghim lên đầu (`togglePinAiChatSession`).
  - **Trash** → xóa phiên (`deleteAiChatSession`, có confirm).

---

## 7. Bước 5 — Đóng / rời chatbot

- Đóng panel → phiên hiện tại **tự động lưu** (đã ghi trong DB qua `updateAiSessionMemory`).
- Mở lại sau → panel hiển thị lại lịch sử cuối cùng.
- Nếu đăng xuất / chuyển tổ chức → phiên của tổ chức cũ không hiển thị.

---

## 8. Luồng lỗi user-facing

| Tình huống                              | User thấy gì                                              |
|-----------------------------------------|-----------------------------------------------------------|
| Câu hỏi mơ hồ                          | Câu hỏi làm rõ (clarification) — không chạy tool.         |
| Không đủ dữ liệu (forecast < 14 ngày)  | Cảnh báo "Chưa đủ dữ liệu để dự báo" + số liệu có sẵn.   |
| Tool RPC lỗi                            | Câu trả lời vẫn có, kèm ghi chú "Một phần dữ liệu lỗi".  |
| Hết quota LLM (circuit breaker mở)     | Thử provider kế tiếp, nếu hết → trả lời deterministic từ dữ liệu quán. |
| File upload sai mime / quá 4 MB         | Toast lỗi client-side, không gửi lên server.              |
| Không có quyền `canViewReports`         | Không thấy nút mở chatbot (route 403 nếu truy cập thẳng API). |
| Prompt injection từ tài liệu           | Hệ thống bỏ qua; user không thấy dấu hiệu.               |

---

## 9. Mẹo dành cho người dùng mới

1. **Bắt đầu từ prompt gợi ý** — chúng đã được verify hoạt động đúng.
2. **Ghi rõ mốc thời gian** trong câu đầu tiên, các câu sau không cần lặp lại.
3. **Dùng tiếng Việt không dấu** vẫn được — hệ thống tự chuẩn hoá.
4. **Một câu hỏi = một ý**. Tránh hỏi gộp nhiều yêu cầu trong cùng một câu.
5. **Thử lại với cách diễn đạt khác** nếu câu trả lời lệch ý — không cần đóng phiên.
6. **Tải tài liệu nội bộ** (quy trình, menu) trước khi hỏi để có câu trả lời chính xác hơn.
7. **Ghim phiên quan trọng** để truy cập nhanh từ lần sau.

---

## 10. Sơ đồ luồng (tóm tắt)

```
Mở chatbot
   │
   ▼
Chọn prompt gợi ý hoặc gõ câu hỏi ──► (tuỳ chọn) đính kèm ảnh / upload tài liệu
   │
   ▼
Bấm Send ──► spinner "Đang phân tích…" + (stream) progress
   │
   ▼
Hệ thống phân loại intent + lấy dữ liệu + sinh câu trả lời
   │
   ▼
Hiển thị: answer + bullets + SOURCES + (tuỳ chọn) chart / dashboard
   │
   ├──► Đánh giá 👍 / 👎
   ├──► Hỏi tiếp (kế thừa ngày)
   ├──► Save dashboard thành template
   └──► Đổi tên / ghim / xoá phiên
```
