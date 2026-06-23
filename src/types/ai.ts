export interface AiSource {
  id: string;
  label: string;
  type: "analytics" | "document";
  detail?: string;
  excerpt?: string;
}

export interface AiChartSpec {
  type: "bar" | "line" | "pie";
  title: string;
  xKey: string;
  yKey: string;
  data: Array<Record<string, string | number>>;
}

export interface AiAnalyticsContext {
  range: { from: string; to: string; label: string };
  salesSummary: {
    total_orders: number;
    net_revenue: number;
    cost_of_goods: number;
    gross_profit: number;
    channel_fees: number;
    net_profit: number;
  } | null;
  topProducts: Array<{
    product_name: string;
    quantity: number;
    revenue: number;
    cost_of_goods: number;
    gross_profit: number;
  }>;
  channelSummary: Array<{
    channel_name: string;
    orders: number;
    revenue: number;
    channel_fees: number;
  }>;
}

export interface AiChatResponse {
  answer: string;
  bullets: string[];
  chart: AiChartSpec | null;
  sources: AiSource[];
  modelUsed: string | null;
  usedFallback: boolean;
  fallbackReason?: string;
}
