import Link from "next/link";
import { canRefreshAnalytics, canViewReports, getActiveMembership, requireActiveContext } from "@/lib/auth/permissions";
import {
  getCustomerClusters,
  getRecentFeedback,
  getRfmCustomers,
  getRfmSummary,
  getSentimentSummary,
} from "@/server/queries/analytics";
import { ClusterPanel } from "@/components/analytics/cluster-panel";
import { RefreshAnalyticsButton, RfmPanel } from "@/components/analytics/rfm-panel";
import { SentimentPanel } from "@/components/analytics/sentiment-panel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CustomerClustersView, FeedbackListRow, RfmSegment, SentimentSummary } from "@/types/analytics";

export const metadata = { title: "Phân tích" };

const TABS = [
  { value: "rfm", label: "RFM" },
  { value: "sentiment", label: "Cảm xúc" },
  { value: "clusters", label: "Nhóm khách" },
  { value: "demand", label: "Dự báo nhu cầu" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const RFM_SEGMENTS: RfmSegment[] = [
  "Champions",
  "Loyal Customers",
  "Potential Loyalists",
  "At Risk",
  "Lost",
];

function parseTab(value?: string): TabValue {
  if (value === "sentiment" || value === "clusters" || value === "demand") return value;
  return "rfm";
}

function parseSegment(value?: string): RfmSegment | undefined {
  if (value && RFM_SEGMENTS.includes(value as RfmSegment)) return value as RfmSegment;
  return undefined;
}

interface PageProps {
  searchParams: { tab?: string; segment?: string };
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const active = await getActiveMembership();
  if (!active) return null;
  if (!canViewReports.includes(active.role)) {
    return <div className="rounded-md border bg-card p-6 text-sm">Bạn không có quyền truy cập phân tích.</div>;
  }

  const ctx = await requireActiveContext();
  const tab = parseTab(searchParams.tab);
  const segment = parseSegment(searchParams.segment);
  const canRefresh = canRefreshAnalytics.includes(active.role);

  const summary = tab === "rfm"
    ? await getRfmSummary(ctx.organizationId, ctx.branchId)
    : [];
  const customers = tab === "rfm"
    ? await getRfmCustomers(ctx.organizationId, ctx.branchId, segment)
    : [];
  let feedback: FeedbackListRow[] = [];
  let sentimentSummary: SentimentSummary = { positive: 0, neutral: 0, negative: 0 };
  let clusters: CustomerClustersView | null = null;
  if (tab === "sentiment") {
    [feedback, sentimentSummary] = await Promise.all([
      getRecentFeedback(ctx.organizationId, ctx.branchId),
      getSentimentSummary(ctx.organizationId, ctx.branchId),
    ]);
  }
  if (tab === "clusters") {
    clusters = await getCustomerClusters(ctx.organizationId, ctx.branchId);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Phân tích</h1>
          <p className="text-sm text-muted-foreground">RFM, cảm xúc khách hàng, phân cụm và dự báo nhu cầu.</p>
        </div>
        <RefreshAnalyticsButton canRefresh={canRefresh} />
      </div>

      <Tabs value={tab}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} asChild>
              <Link href={`/analytics?tab=${t.value}`}>{t.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "rfm" ? (
        <RfmPanel summary={summary} customers={customers} segment={segment} />
      ) : tab === "sentiment" ? (
        <SentimentPanel rows={feedback} summary={sentimentSummary} />
      ) : tab === "clusters" && clusters ? (
        <ClusterPanel
          profiles={clusters.profiles}
          customers={clusters.customers}
          reminder={clusters.reminder}
          canRefresh={canRefresh}
          fittedAt={clusters.fittedAt}
        />
      ) : (
        <div className="rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Dự báo nhu cầu sẽ có trong bản cập nhật tiếp theo.
        </div>
      )}
    </div>
  );
}
