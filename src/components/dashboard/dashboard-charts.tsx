"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { formatVND } from "@/lib/date/ranges";

const COLORS = ["#0f172a", "#1d4ed8", "#0ea5e9", "#14b8a6", "#f59e0b", "#f43f5e", "#a855f7", "#64748b"];

export function DashboardCharts({
  trend,
  menu,
  channel,
}: {
  trend: { bucket: string; revenue: number; orders: number }[];
  menu: { categoryName: string; revenue: number; orders: number }[];
  channel: { channelName: string; revenue: number; orders: number }[];
}) {
  const hasTrend = trend.length > 0;
  const hasMenu = menu.length > 0;
  const hasChannel = channel.length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Doanh thu theo thời gian</CardTitle>
          <CardDescription>Doanh thu thuần từ các đơn đã thanh toán trong kỳ.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasTrend ? (
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => v.toLocaleString("vi-VN")} tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={(v) => formatVND(Number(v))} />
                  <Line type="monotone" dataKey="revenue" stroke="#1d4ed8" strokeWidth={2} name="Doanh thu" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu trong khoảng thời gian này.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Doanh thu theo nhóm món</CardTitle>
          <CardDescription>Phân bổ doanh thu giữa các nhóm thực đơn.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasMenu ? (
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={menu} dataKey="revenue" nameKey="categoryName" innerRadius={50} outerRadius={90}>
                    {menu.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatVND(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu nhóm món.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Doanh thu theo kênh bán</CardTitle>
          <CardDescription>Phân bổ theo kênh bán hàng.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasChannel ? (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={channel}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="channelName" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => v.toLocaleString("vi-VN")} tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={(v) => formatVND(Number(v))} />
                  <Bar dataKey="revenue" fill="#0ea5e9" name="Doanh thu" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu kênh bán.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
