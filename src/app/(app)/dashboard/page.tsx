import Link from "next/link";
import { ShoppingBag, Receipt, Table2, TrendingUp, Calendar } from "lucide-react";
import { requireActiveContext, canViewReports, getActiveMembership } from "@/lib/auth/permissions";
import { getDashboardSummary } from "@/server/queries/dashboard";
import { parseDateRangeSearchParams, type DateRangePreset, formatVND } from "@/lib/date/ranges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";

interface PageProps {
  searchParams: { range?: string; from?: string; to?: string };
}

const PRESET_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "last7", label: "7 ngày qua" },
  { value: "thisMonth", label: "Tháng này" },
  { value: "lastMonth", label: "Tháng trước" },
];

export default async function DashboardPage({ searchParams }: PageProps) {
  const active = await getActiveMembership();
  if (!active) {
    return <div className="rounded-md border bg-card p-6 text-sm">Bạn chưa thuộc cửa hàng nào.</div>;
  }
  if (!canViewReports.includes(active.role)) {
    return <div className="rounded-md border bg-card p-6 text-sm">Bạn không có quyền truy cập trang tổng quan.</div>;
  }
  const ctx = await requireActiveContext();
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v) params.set(k, String(v));
  }
  const range = parseDateRangeSearchParams(params);
  const summary = await getDashboardSummary({
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    range,
    granularity: range.to.getTime() - range.from.getTime() > 1000 * 60 * 60 * 24 * 2 ? "day" : "hour",
  });
  const preset = (searchParams.range as DateRangePreset) ?? "today";

  const cards = [
    { label: "Doanh thu hôm nay", value: formatVND(summary.revenueToday), icon: TrendingUp },
    { label: "Đơn hàng hôm nay", value: summary.ordersToday.toLocaleString("vi-VN"), icon: ShoppingBag },
    { label: "Bàn đang dùng", value: `${summary.occupiedTables}/${summary.totalTables}`, icon: Table2 },
    { label: "Doanh thu thuần (kỳ)", value: formatVND(summary.selectedNetRevenue), icon: Receipt },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tổng quan</h1>
          <p className="text-sm text-muted-foreground">Dữ liệu thật từ đơn hàng, thanh toán và kho hàng.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {range.label}
        </div>
      </div>

      <Tabs value={preset}>
        <TabsList>
          {PRESET_OPTIONS.map((p) => (
            <TabsTrigger key={p.value} value={p.value} asChild>
              <Link href={`/dashboard?range=${p.value}`}>{p.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{c.label}</CardTitle>
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">{c.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DashboardCharts
        trend={summary.revenueTrend}
        menu={summary.menuBreakdown}
        channel={summary.channelBreakdown}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hiệu quả thực đơn</CardTitle>
            <CardDescription>Các chỉ số trung bình theo đơn hàng đã thanh toán.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Giá trị trung bình / món</span>
              <span className="font-medium">{formatVND(summary.averageItemValue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Giá trị trung bình / đồ ăn</span>
              <span className="font-medium">{formatVND(summary.foodAverage)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Giá trị trung bình / đồ uống</span>
              <span className="font-medium">{formatVND(summary.drinkAverage)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Số đơn đã thanh toán (kỳ)</span>
              <span className="font-medium">{summary.paidOrders.toLocaleString("vi-VN")}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tổng quan hủy món / hóa đơn</CardTitle>
            <CardDescription>Theo dõi tình trạng hủy trong kỳ đã chọn.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Món bị hủy</span>
              <Badge variant="warning">{summary.cancelledItems}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Hóa đơn bị hủy</span>
              <Badge variant="warning">{summary.cancelledOrders}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Hủy sau khi báo bếp</span>
              <Badge variant="info">{summary.cancelledAfterKitchen}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Hủy sau tạm tính</span>
              <Badge variant="info">{summary.cancelledAfterTempBill}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Hủy do hết hàng</span>
              <Badge variant="danger">{summary.cancelledOutOfStock}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top sản phẩm</CardTitle>
          <CardDescription>Sắp xếp theo doanh thu trong kỳ đã chọn.</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.topProducts.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu trong khoảng thời gian này.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead className="text-right">Số lượng</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.topProducts.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">{p.quantity.toLocaleString("vi-VN")}</TableCell>
                    <TableCell className="text-right">{formatVND(p.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
