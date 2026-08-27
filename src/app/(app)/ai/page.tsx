import { canViewReports, getActiveMembership, requireActiveContext } from "@/lib/auth/permissions";
import { getAiUsageSummary, listAiChatMessages, listAiChatSessions } from "@/server/ai/conversations";
import { listAiDashboardTemplates, listAiDocuments } from "@/server/queries/ai";
import { AiAssistant } from "@/components/ai/ai-assistant-lazy";

export const metadata = { title: "AI trợ lý" };

export default async function AiPage() {
  const active = await getActiveMembership();
  if (!active) return null;
  if (!canViewReports.includes(active.role)) {
    return <div className="rounded-md border bg-card p-6 text-sm">Bạn không có quyền dùng trợ lý AI.</div>;
  }
  const ctx = await requireActiveContext();
  const [documents, dashboardTemplates, chatSessions, usageSummary] = await Promise.all([
    listAiDocuments(ctx.organizationId),
    listAiDashboardTemplates(ctx.organizationId),
    listAiChatSessions(ctx.organizationId, ctx.branchId, ctx.userId),
    getAiUsageSummary(ctx.organizationId, ctx.branchId),
  ]);
  const activeSessionId = chatSessions[0]?.id ?? null;
  const initialMessages = activeSessionId ? await listAiChatMessages(activeSessionId) : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">AI trợ lý</h1>
        <p className="text-sm text-muted-foreground">Hỏi đáp dữ liệu kinh doanh có biểu đồ và nguồn trích dẫn.</p>
      </div>
      <AiAssistant
        organizationId={ctx.organizationId}
        branchId={ctx.branchId}
        documents={documents}
        dashboardTemplates={dashboardTemplates}
        chatSessions={chatSessions}
        initialSessionId={activeSessionId}
        initialMessages={initialMessages}
        usageSummary={usageSummary}
      />
    </div>
  );
}
