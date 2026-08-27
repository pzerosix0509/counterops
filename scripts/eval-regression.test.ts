/**
 * Entrypoint cho `npm run eval:ai` — chạy eval 3 lớp + ghi report JSON + so sánh history.
 * Nằm ngoài src/__tests__ nên không chạy khi `npm test`; chỉ chạy khi trỏ trực tiếp.
 */
import "@/lib/ai/eval/regression-runner";
