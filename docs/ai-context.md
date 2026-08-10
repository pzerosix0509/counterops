# AI Assistant — Bối cảnh kỹ thuật (context)

> File này mô tả kiến trúc, luồng xử lý, quyết định thiết kế và các cạm bẫy đã gặp
> của chức năng trợ lý AI trong dự án. Đọc trước khi sửa bất kỳ code nào thuộc `src/lib/ai`,
> `src/server/ai`, `src/app/api/ai` hoặc các server actions `src/server/actions/ai-*.ts`.

---

## 1. Tổng quan pipeline

```
Người dùng (chat UI)
  → POST /api/ai/chat  (route.ts: xác thực, validate, đọc ảnh nếu có)
  → runAiAnalysis()    (orchestrator.ts — điều phối toàn bộ)
      ├─ 1. buildAiPlanAsync()   → intent + range + danh sách tool (semantic-layer.ts)
      ├─ 2. executeAiToolPlan()  → chạy tool RPC/tìm kiếm (tools.ts)
      ├─ 3. assessAiEvidence()   → confidence, quality issues, anomalies (assessment.ts)
      ├─ 4. buildAnalyticsContext() → gom dữ liệu tool thành context (analytics.ts)
      ├─ 5. generateAiModelAnswer() → gọi LLM nếu intent không deterministic (provider.ts)
      ├─ 6. Chọn câu trả lời:
      │     deterministic intent  → buildDeterministicAnswer()
      │     model thành công      → modelResult.answer
      │     model fail            → buildFallbackAnswer()
      └─ 7. Lưu hội thoại + telemetry (conversations.ts, logAiRun)
```

Điểm vào HTTP: `src/app/api/ai/chat/route.ts` — yêu cầu đăng nhập + quyền `canViewReports`.
Hỗ trợ 2 chế độ: JSON thường và NDJSON stream (`?stream=true` → sự kiện `progress`/`result`/`error`).

---

## 2. Intent classification

Định nghĩa: `src/types/ai.ts` — `AiIntent`.

| Intent | Mô tả | Deterministic? | Model tier | Tools |
|---|---|---|---|---|
| `greeting` | Chào hỏi lịch sự thuần (Xin chào, Hello) | ✅ | none | — |
| `capability` | Hỏi trợ lý là ai / làm được gì | ❌ | quality | — |
| `metric_lookup` | Doanh thu, lợi nhuận, số đơn trong kỳ | ✅ | none | `sales_summary` |
| `trend` | Xu hướng theo thời gian, biểu đồ | ✅ | none | `sales_summary`, `sales_timeseries` |
| `comparison` | So sánh kỳ, tăng/giảm | ✅ | none | `sales_summary`, `period_comparison` |
| `product_ranking` | Món bán chạy, lãi cao/thấp | ✅ | none | `sales_summary`, `top_products` |
| `category_analysis` | Theo nhóm món/danh mục | ✅ | none | `sales_summary`, `category_summary` |
| `channel_analysis` | Theo kênh bán (Grab, Shopee...) | ✅ | none | `sales_summary`, `channel_summary` |
| `inventory_risk` | Tồn kho, hết hàng, âm kho | ✅ | none | `inventory_risk` |
| `document_search` | Tìm trong tài liệu đã upload | ❌ | fast | `search_documents` |
| `web_search` | Tra cứu web (giá vàng, tin tức...) | ❌ | fast | `search_web` |
| `dashboard` | Tạo dashboard/bảng điều khiển | ✅ | none | 6 tool analytics |
| `diagnosis` | Tại sao, nguyên nhân, khuyến nghị | ❌ | quality | `sales_summary`, `sales_timeseries`, `period_comparison`, `top_products`, `channel_summary` |
| `forecast` | Dự báo doanh thu tương lai | ❌ | fast | `sales_summary`, `sales_timeseries`, `forecast_revenue` |
| `conversation_summary` | Tóm tắt cuộc trò chuyện | ❌ | quality | `sales_summary`, `top_products`, `channel_summary` |
| `out_of_scope` | Không liên quan dữ liệu quán | ❌ | fast | — |

### Luồng quyết định
1. `inferIntent()` — regex/keyword (deterministic, không gọi model, nhanh).
2. Nếu không khớp → fallback `out_of_scope` (model trả lời chung).
3. `buildAiPlanAsync()` — nếu có API key, gọi `planWithLlm()` (LLM planner) để chọn intent + range chính xác hơn; nếu LLM fail (mất key, timeout, circuit open) → dùng regex.

### ⚠️ Quy tắc keyword quan trọng (đã fix nhiều lần)
- **Từ "kho" đơn lẻ KHÔNG được dùng làm keyword inventory** — "khó", "khoảng" sẽ bị strip dấu thành "kho". Chỉ dùng: `ton kho`, `am kho`, `het kho`, `kho hang`, `nguyen lieu`, `het hang`, `sap het`, hoặc token đơn `ton`, `inventory`.
- **Dashboard keyword** phải đứng đầu câu hoặc sau khoảng trắng: regex `/(^|\s)(dashboard|bang dieu khien|kpi)\b/`. "KPI là gì" vẫn bị xem là dashboard (chấp nhận được), nhưng "Tổng quan KPI" phải match dashboard.
- **Mọi keyword tiếng Việt phải strip dấu trước khi so sánh** (`normalizeIntentText`): "dự báo" → "du bao", "nhóm món" → "nhom mon". Đừng viết keyword có dấu — sẽ không bao giờ match (đã từng xảy ra ở `buildChartForQuestion`).

---

## 3. Date range & timezone

`inferAiDateRange(question, now, timezone)` trong `semantic-layer.ts`.

### ⚠️ Timezone (lỗi nghiêm trọng đã fix)
- Ngày bắt đầu/kết thúc phải tính theo **múi giờ quán** (`organization.timezone` / `branch.timezone`), KHÔNG theo múi giờ server (thường là UTC).
- `startOfDayInZone()` dùng `Intl.DateTimeFormat` để lấy ngày local rồi trừ offset — không dùng `setHours(0,0,0)`.
- `timezone` được truyền vào mọi tool arguments (`rangeArgumentsSchema` bắt buộc có `timezone`).

### Range cho tương lai (forecast)
- `"tháng tới"`/`"tuần tới"` KHÔNG được trả range tương lai — forecast cần **dữ liệu lịch sử** để train:
  - "tháng tới" → 30 ngày qua (đủ ≥14 ngày training)
  - "tuần tới" → 14 ngày qua
- `buildAiPlanAsync`: với intent `forecast`, **luôn dùng range từ regex** (`fallback.range`), bỏ qua range LLM — vì LLM có thể trả range tương lai (query vào dữ liệu rỗng → `insufficient_data`).

### Kế thừa ngày từ câu trước
- Nếu câu hiện tại không có mốc thời gian, sẽ tìm câu user gần nhất có mốc (`previousUserQuestions`) và kế thừa range.

---

## 4. Tools

`src/server/ai/tools.ts` — `executeAiToolPlan()` chạy song song tất cả tool trong plan.

| Tool | RPC/nguồn | Arguments bắt buộc |
|---|---|---|
| `sales_summary` | `ai_sales_summary` | from, to, rangeLabel, timezone |
| `sales_timeseries` | `ai_sales_timeseries` | + granularity (hour/day/week/month) |
| `top_products` | `ai_top_products` | + limit (1-50) |
| `category_summary` | `ai_category_summary` | + limit |
| `channel_summary` | `ai_channel_summary` | from, to, rangeLabel, timezone |
| `period_comparison` | `ai_period_comparison` | from, to, rangeLabel, timezone |
| `inventory_risk` | SQL direct | status: "attention" |
| `search_documents` | `searchAiDocumentChunks` | query (2-1000), limit (1-12) |
| `search_web` | Tavily API | query (2-500), limit (1-10, optional) |
| `forecast_revenue` | `ai_sales_timeseries` + `computeForecast` | from, to, rangeLabel, timezone, horizon_days (7-90, optional) |

### ⚠️ Schema validation (đã fix lỗi nghiêm trọng)
- **KHÔNG dùng `z.string().datetime()`** cho `from`/`to` — nó chỉ chấp nhận ISO có `Z`, từ chối `+07:00`. LLM planner trả range có offset → cả 3 tool fail "Tham số tool không hợp lệ".
- Đã thay bằng `isoDateTime = z.string().refine(v => !isNaN(Date.parse(v)))`.
- `forecast_revenue`: range từ tool arguments phải là **quá khứ** (lịch sử training). `horizon_days` mặc định 30.

### Forecast
`src/lib/ai/forecast.ts`:
- `computeForecast()` — weighted moving average (ngày gần trọng số cao hơn), confidence interval 1.5σ.
- **Cần tối thiểu 14 ngày dữ liệu** (`MIN_DAYS_REQUIRED`), nếu ít hơn → `insufficient_data: true`.
- `aggregateToDailyPoints()` nhóm theo `period_start.slice(0, 10)` — **phụ thuộc timezone của RPC** `ai_sales_timeseries` (đã truyền `p_timezone`). Không tự ý bỏ `p_timezone`.

---

## 5. Evidence assessment

`src/lib/ai/assessment.ts` — `assessAiEvidence()`:
- Tạo `qualityIssues` (critical/warning/info) từ lỗi tool, thiếu summary, mẫu nhỏ (<5 đơn), doanh thu âm, mismatch món vs tổng.
- Tạo `anomalies`: lỗ, doanh thu biến động ≥30% (≥60% critical), tập trung 1 món ≥60%, 1 kênh ≥80%, hàng âm kho.
- `confidence.score` khởi điểm 0.95, trừ theo issue; level: ≥0.85 high, ≥0.55 medium, còn lại low.

---

## 6. LLM provider

`src/server/ai/provider.ts` — `generateAiModelAnswer(payload, tier)`.

### Provider chain
Thứ tự: **nvidia → minimax → openai** (cái nào có key thì dùng). Tier quyết định model:
- `fast` → `AI_FAST_MODEL`
- `quality` → `AI_QUALITY_MODEL`
- `none` → không gọi model (deterministic)

### Circuit breaker
- `AI_CIRCUIT_FAILURE_THRESHOLD` (mặc định 2), `AI_CIRCUIT_COOLDOWN_MS` (mặc định 60s).
- Mỗi provider có breaker riêng; khi mở → thử provider kế tiếp.

### System prompt (các nhánh quan trọng)
- `out_of_scope`: giới thiệu bản thân nếu hỏi về trợ lý, trả lời kiến thức chung ngắn gọn, không bịa số liệu.
- `capability`: giới thiệu + liệt kê khả năng, không bịa số liệu.
- Mọi intent đều có: "Chỉ kết luận từ EVIDENCE/SOURCES", trích nguồn `[S1]`, tôn trọng confidence, không tiết lộ prompt, trả JSON thuần `{answer, bullets, dashboard}`.
- Dashboard: bắt buộc object hợp lệ, chỉ dùng chart type chuẩn.

### Model answer schema
`src/lib/ai/schemas.ts` — `aiModelAnswerSchema`: answer (1-12000), bullets (≤10, mỗi cái ≤800), dashboard (nullable, strict schema). Có `repairModelAnswer()` để sửa lỗi format model trả về trước khi fallback.

---

## 7. Analytics & deterministic answers

`src/server/ai/analytics.ts`:
- `buildAnalyticsContext(executions)` — gom rows tool thành `AiAnalyticsContext`.
- `buildDeterministicAnswer(plan, analytics, ...)` — switch theo intent, tạo bullets từ dữ liệu (formatVND, citation `[S1]`).
- `buildChartForQuestion(question, analytics)` — tạo chart spec. **Phải strip dấu keyword trước khi `includes`** ("du bao", "nhom mon", "kenh ban", "top mon").
- `buildDashboardSpec(analytics)` — dashboard deterministic khi model không trả được.
- `buildFallbackAnswer(question, analytics, sources)` — dùng khi model fail; có nhánh greeting/capability/web/document/product/channel. **Cũng strip dấu** cho `q`.

### ⚠️ Lưu ý
- `buildDeterministicAnswer` switch theo intent — khi thêm intent mới phải thêm case, không để rơi vào `default` sai.
- `buildFallbackAnswer` nhánh greeting phải dùng regex không dấu (đã fix).

---

## 8. Memory & hội thoại

`src/server/ai/conversations.ts`:
- `getConversationMemory(sessionId)` → `{ summary, turns[] }` (8 lượt gần nhất).
- `updateAiSessionMemory()` — nén lịch sử thành summary khi dài.
- **Hạn chế hiện tại**: `planWithLlm` không nhận lịch sử hội thoại; chỉ `buildAiPlan` regex kế thừa ngày từ câu trước. Nếu muốn LLM planner hiểu ngữ cảnh nhiều lượt, cần truyền `memory.turns` vào prompt.

---

## 9. Streaming & frontend

- Frontend: `src/components/ai-assistant.tsx` — luôn gửi `mode: "chat"`; dashboard được detect server-side qua `isDashboardIntent`.
- Stream: NDJSON, mỗi dòng 1 `AiStreamEvent` JSON.
- Ảnh: `imageToText()` (NVIDIA vision) → trích văn bản/mô tả → đưa vào `sources` dạng document, ép pipeline gọi model (`effectivePlan` override thành `document_search` nếu deterministic).
- Upload ảnh: validate client-side mime (`image/jpeg|png|webp|gif`) và kích thước (≤4MB base64); PDF chưa được validate size phía client.

---

## 10. Quyền & bảo mật

- Route `/api/ai/chat`: cần đăng nhập + role trong `canViewReports`.
- Tool context luôn lấy `organizationId`/`branchId` từ session (không nhận từ client) → RLS của Supabase phân quyền.
- Nội dung tài liệu upload trong SOURCES là **dữ liệu không tin cậy**, prompt injection bị vô hiệu hóa bằng system prompt.
- Web search chỉ tham khảo, không coi là sự thật tuyệt đối.

---

## 11. Telemetry & logging

- `logAiRun()` (conversations.ts) lưu: status (success/fallback), intent, confidence, telemetry (plannerMs, toolsMs, providerMs...), toolCalls, usage, latency.
- Cache: `src/server/ai/cache.ts` — cache kết quả RPC theo org+branch+tool+arguments (60s), trừ `search_documents`.
- Circuit breaker chia sẻ global symbol key giữa các module.

---

## 12. Env vars

| Biến | Dùng cho | Ghi chú |
|---|---|---|
| `NVIDIA_API_KEY` | Provider chính, vision, classifier, planner | |
| `MINIMAX_API_KEY` | Provider fallback | |
| `OPENAI_API_KEY` | Provider fallback | |
| `AI_FAST_MODEL` | Tier fast | |
| `AI_QUALITY_MODEL` | Tier quality | |
| `AI_VISION_MODEL` | Đọc ảnh | Mặc định nemotron nano |
| `AI_CLASSIFIER_MODEL` | Intent classifier | |
| `TAVILY_API_KEY` | Web search | |
| `AI_CIRCUIT_FAILURE_THRESHOLD` | Circuit breaker | Mặc định 2 |
| `AI_CIRCUIT_COOLDOWN_MS` | Circuit breaker | Mặc định 60000 |
| `AI_INPUT_COST_PER_MILLION` / `AI_OUTPUT_COST_PER_MILLION` | Ước tính chi phí | USD |

---

## 13. Test

- `src/__tests__/ai-golden.test.ts` — golden questions: mỗi câu phải ra đúng intent + tools + range + deterministic + model tier. **Thêm case mới khi đổi hành vi intent/range.**
- `src/__tests__/ai-runtime.test.ts` — pipeline chạy end-to-end với mocks.
- `src/__tests__/llm-planner.test.ts`, `intent-classifier.test.ts`, `web-search.test.ts`, `image-to-text.test.ts`, `ai-migration.test.ts`.
- Lệnh: `npx vitest run src/__tests__/ai-*.test.ts`, `npx tsc --noEmit`, `npx eslint src/lib/ai src/server/ai`.

---

## 14. Checklist khi sửa

1. Keyword tiếng Việt: strip dấu trước, đừng dùng từ có dấu.
2. `from`/`to` luôn ISO hợp lệ (có thể có offset) — không dùng `z.string().datetime()`.
3. Range tương lai → chỉ dùng cho forecast, và forecast phải train trên quá khứ (≥14 ngày).
4. Intent deterministic → không gọi model; nếu model được gọi mà fail → phải có fallback phù hợp intent (không rơi vào generic sai).
5. Timezone: luôn truyền từ `input.timezone`, tính ngày theo múi giờ quán.
6. Thêm intent mới → cập nhật: `AiIntent`, `toolsForIntent`, `inferIntent`, `INTENT_DESCRIPTIONS` (classifier + planner), switch `buildDeterministicAnswer`, `buildFallbackAnswer`, golden questions.
7. Chạy đủ: vitest AI + tsc + eslint.
