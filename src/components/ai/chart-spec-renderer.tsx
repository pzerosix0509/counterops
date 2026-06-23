"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatVND } from "@/lib/date/ranges";
import type { AiChartSpec } from "@/types/ai";

const COLORS = ["#0f172a", "#2563eb", "#0ea5e9", "#14b8a6", "#f59e0b", "#e11d48"];

function seriesLabel(key: string): string {
  const labels: Record<string, string> = {
    revenue: "Doanh thu",
    profit: "Lãi gộp",
    fees: "Phí",
    value: "Giá trị",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

function getNumericSeries(chart: AiChartSpec): string[] {
  const keys = new Set<string>();
  chart.data.forEach((row) => {
    Object.entries(row).forEach(([key, value]) => {
      if (key !== chart.xKey && typeof value === "number") keys.add(key);
    });
  });
  return Array.from(keys);
}

export function ChartSpecRenderer({ chart }: { chart: AiChartSpec | null }) {
  if (!chart || chart.data.length === 0) return null;
  const series = getNumericSeries(chart);
  const yKeys = series.length > 0 ? series : [chart.yKey];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{chart.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer>
            {chart.type === "line" ? (
              <LineChart data={chart.data} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey={chart.xKey} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => Number(value).toLocaleString("vi-VN")} tick={{ fontSize: 11 }} width={82} />
                <Tooltip formatter={(value) => formatVND(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {yKeys.map((key, index) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    name={seriesLabel(key)}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            ) : chart.type === "pie" ? (
              <PieChart>
                <Pie data={chart.data} dataKey={chart.yKey} nameKey={chart.xKey} innerRadius={62} outerRadius={104} paddingAngle={2}>
                  {chart.data.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => formatVND(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            ) : (
              <BarChart data={chart.data} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey={chart.xKey} tick={{ fontSize: 11 }} interval={0} />
                <YAxis tickFormatter={(value) => Number(value).toLocaleString("vi-VN")} tick={{ fontSize: 11 }} width={82} />
                <Tooltip formatter={(value) => formatVND(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {yKeys.map((key, index) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={COLORS[index % COLORS.length]}
                    name={seriesLabel(key)}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
