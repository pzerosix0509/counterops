# Bộ Eval AI — Verified Query Repository & regression

Bộ eval 3 lớp theo chuẩn Snowflake Verified Queries / Fabric Data Agent: câu hỏi
tự nhiên ghép với semantic query + ground-truth số đã được xác minh, tách guidance
khỏi eval để tránh "học thuộc", lưu chi tiết bước chạy để debug hồi quy.

## Chạy

```bash
npm run eval:ai            # chạy eval 3 lớp + ghi report + so sánh history
npx vitest run src/__tests__/eval-suite.test.ts   # chỉ eval (trong npm test)
```

Script `eval:ai`:
- Ghi `eval-results/latest.json` + `eval-results/history/<timestamp>.json`.
- In summary: `Planning | Numbers | Quality | Overall`.
- So sánh với lần chạy trước: `planning: 97.0% → 98.0% (+1.0pp)`, liệt kê `New failures`.
- **Fail CI nếu bất kỳ layer nào < 95%** — dùng để chặn hồi quy khi đổi
  model/prompt/metric version.

## 3 lớp

| Layer | Kiểm tra | Không cần |
|-------|----------|-----------|
| `planning` | intent/tools/range/semantic-query đúng; câu mơ hồ phải hỏi lại | model, DB |
| `numbers` | ground-truth số trên synthetic dataset (doanh thu, profit, top product/channel, forecast) ± tolerance; nguồn bắt buộc | model, DB |
| `quality` | data-quality: missing/duplicate/refund/outlier/timeout/empty/small-sample; kỳ chưa hoàn tất | model, DB |

## Files

- `src/lib/ai/eval/verified-queries.json` — **Verified Query Repository** (single source).
  `purpose: "eval"` → chỉ chấm điểm; `purpose: "guidance"` → được phép inject prompt (exemplar).
  Eval set không bao giờ vào prompt.
- `src/lib/ai/eval/synthetic-data.ts` — 35 ngày fixture (mùa vụ T7/CN, outlier
  khuyến mãi + sự kiện, hoàn tiền, thiếu ngày, trùng ngày, ngày cuối chưa hoàn tất)
  + `scenarioDays()` cho data-quality.
- `src/lib/ai/eval/mock-tools.ts` — mock tool đọc fixture (tính timezone như DB).
- `src/lib/ai/eval/load-verified.ts` — load/validate JSON, tách guidance/eval.
- `src/lib/ai/eval/runner.ts` — `runEvalSuite({layer, scenario, now})`.
- `src/lib/ai/eval/regression-runner.ts` + `scripts/eval-regression.test.ts` — script report.

## Ground-truth & tolerance

- Số expected trong `verified-queries.json` tính từ chính fixture (cùng nguồn).
- Lookup/comparison: ±0.5%; forecast: ±30% (có nhiễu).
- So qua object `analytics` (không parse chuỗi format tiền) — tránh phụ thuộc format.

## Thêm câu verified mới

1. Thêm vào `verified-queries.json` với `purpose`, `layer`, đủ assertion.
2. Nếu là numbers-layer: lấy expected từ `mockExecuteAiToolPlan` (chạy thử).
3. `npm run eval:ai` — phải ≥ 95% từng layer.

## Phát hiện từ eval (bug thật đã fix)

- "Giá hôm nay thế nào?" → trước đoán web_search, nay hỏi lại (ambiguity web/metric).
- "Doanh thu hôm nay đến giờ" → range.to giờ cắt tại thời điểm hiện tại.
- Outlier ngày (MAD) → trước không detect cho trend, nay có anomaly `timeseries_outlier`.
- Dữ liệu trùng ngày → nay có issue `duplicate_rows` (reconciliation).
- Mock timezone: from/to ISO có offset giờ tính đúng ngày local (trước lệch 1 ngày).
