/**
 * Policy validator — kiểm tra tool plan trước khi execute.
 * - Map tool → min role (khớp RPC SQL: owner/admin/manager/cashier)
 * - Giới hạn search_web ≤ 1 lần/câu hỏi (trừ dashboard)
 * - Từ chối tool lạ ngoài catalog
 */

import type { AiPlan, AiToolCall, AiToolName } from "@/types/ai";

export interface PolicyContext {
  role: string;
  isDashboardMode: boolean;
}

export interface PolicyViolation {
  tool: AiToolName;
  message: string;
}

const TOOL_MIN_ROLE: Partial<Record<AiToolName, string>> = {
  sales_summary: "cashier",
  sales_timeseries: "cashier",
  top_products: "cashier",
  category_summary: "cashier",
  channel_summary: "cashier",
  period_comparison: "cashier",
  inventory_risk: "manager",
  search_documents: "cashier",
  search_web: "cashier",
  forecast_revenue: "cashier",
};

const ROLE_RANK: Record<string, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  cashier: 1,
};

const KNOWN_TOOLS = new Set<AiToolName>(Object.keys(TOOL_MIN_ROLE) as AiToolName[]);

export function validateToolPlan(plan: Pick<AiPlan, "tools" | "intent">, context: PolicyContext): PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  for (const call of plan.tools) {
    if (!KNOWN_TOOLS.has(call.name)) {
      violations.push({ tool: call.name, message: `Tool "${call.name}" không nằm trong danh mục cho phép.` });
      continue;
    }
    const minRole = TOOL_MIN_ROLE[call.name];
    if (minRole && (ROLE_RANK[context.role] ?? 0) < (ROLE_RANK[minRole] ?? 0)) {
      violations.push({ tool: call.name, message: `Role "${context.role}" không đủ quyền dùng "${call.name}" (cần ${minRole}).` });
    }
  }

  // search_web tối đa 1 lần/câu hỏi (trừ dashboard — cần nhiều ngữ cảnh hơn)
  if (!context.isDashboardMode) {
    const webCount = plan.tools.filter((call) => call.name === "search_web").length;
    if (webCount > 1) {
      violations.push({ tool: "search_web", message: "Chỉ được gọi tìm kiếm web tối đa 1 lần cho một câu hỏi." });
    }
  }

  return violations;
}

/** Lọc các tool call vi phạm ra khỏi plan (không chạy) */
export function filterViolatingTools(calls: AiToolCall[], violations: PolicyViolation[]): AiToolCall[] {
  const blocked = new Set(violations.map((violation) => violation.tool));
  return calls.filter((call) => !blocked.has(call.name));
}
