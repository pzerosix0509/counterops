"use client";

import { Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartSpecRenderer } from "@/components/ai/chart-spec-renderer";
import { cn } from "@/lib/utils/format";
import { formatVND } from "@/lib/date/ranges";
import type { AiDashboardCardSpec, AiDashboardSpec } from "@/types/ai";

function cardToneClass(tone: AiDashboardCardSpec["tone"]) {
  switch (tone) {
    case "good":
      return "border-emerald-200 bg-emerald-50/60";
    case "warning":
      return "border-amber-200 bg-amber-50/60";
    case "bad":
      return "border-rose-200 bg-rose-50/60";
    default:
      return "bg-background";
  }
}

function formatCell(value: string | number): string {
  if (typeof value === "number" && Math.abs(value) >= 1000) return formatVND(value);
  return String(value);
}

export function AiDashboardRenderer({ dashboard }: { dashboard: AiDashboardSpec | null }) {
  if (!dashboard) return null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{dashboard.title}</CardTitle>
              {dashboard.description ? <CardDescription>{dashboard.description}</CardDescription> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {dashboard.filters.map((filter) => <Badge key={filter} variant="outline">{filter}</Badge>)}
            </div>
          </div>
        </CardHeader>
        {dashboard.cards.length > 0 ? (
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {dashboard.cards.map((card, index) => (
              <div key={`${card.title}-${index}`} className={cn("rounded-md border p-3", cardToneClass(card.tone))}>
                <p className="text-xs text-muted-foreground">{card.title}</p>
                <p className="mt-2 text-xl font-semibold">{card.value}</p>
                {card.description ? <p className="mt-1 text-xs text-muted-foreground">{card.description}</p> : null}
                {card.delta ? (
                  <div className="mt-2 flex items-center gap-1 text-xs">
                    {card.delta.direction === "down" ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                    <span>{card.delta.label}: {card.delta.value}</span>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        ) : null}
      </Card>

      {dashboard.charts.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {dashboard.charts.map((chart, index) => <ChartSpecRenderer key={`${chart.title}-${index}`} chart={chart} />)}
        </div>
      ) : null}

      {dashboard.tables.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {dashboard.tables.map((table, index) => (
            <Card key={`${table.title}-${index}`}>
              <CardHeader>
                <CardTitle>{table.title}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      {table.columns.map((column) => (
                        <th key={column.key} className={cn("px-2 py-2 font-medium", column.align === "right" ? "text-right" : "text-left")}>
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.slice(0, 12).map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b last:border-0">
                        {table.columns.map((column) => (
                          <td key={column.key} className={cn("px-2 py-2", column.align === "right" ? "text-right" : "text-left")}>
                            {formatCell(row[column.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {dashboard.insights.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Insight AI</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {dashboard.insights.map((insight, index) => (
              <div key={index} className="flex gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                <Lightbulb className="mt-0.5 h-4 w-4 text-primary" />
                <p>{insight}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
