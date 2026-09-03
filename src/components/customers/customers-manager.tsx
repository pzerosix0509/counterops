"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/common/states";
import { CustomerDetailDialog } from "@/components/customers/customer-detail-dialog";
import { CustomerEditDialog } from "@/components/customers/customer-edit-dialog";
import { clusterLabel, RFM_SEGMENTS, rfmSegmentLabel, SEGMENT_VARIANT } from "@/lib/customers/labels";
import { formatVND } from "@/lib/date/ranges";
import type { CustomerDetail, CustomerListFilters, CustomerListRow } from "@/types/customers";

function buildCustomerQuery(filters: CustomerListFilters, extra?: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.segment) params.set("segment", filters.segment);
  if (filters.cluster != null) params.set("cluster", String(filters.cluster));
  if (filters.recency) params.set("recency", filters.recency);
  if (filters.sort !== "monetary") params.set("sort", filters.sort);
  if (filters.dir !== "desc") params.set("dir", filters.dir);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
  }
  const qs = params.toString();
  return qs ? `/customers?${qs}` : "/customers";
}

export function CustomersManager({
  rows,
  total,
  clusterIds,
  filters,
  selectedCustomer,
  canManage,
}: {
  rows: CustomerListRow[];
  total: number;
  clusterIds: number[];
  filters: CustomerListFilters;
  selectedCustomer: CustomerDetail | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(filters.search ?? "");
  const [segment, setSegment] = useState(filters.segment ?? "all");
  const [cluster, setCluster] = useState(filters.cluster == null ? "all" : String(filters.cluster));
  const [recency, setRecency] = useState(filters.recency ?? "all");
  const [sort, setSort] = useState(filters.sort);
  const [dir, setDir] = useState(filters.dir);
  const [editing, setEditing] = useState(false);

  function applyFilters(overrides?: Partial<CustomerListFilters> & { id?: string | null }) {
    const next: CustomerListFilters = {
      search: (overrides && "search" in overrides ? overrides.search : query.trim()) || undefined,
      segment: (overrides?.segment ?? (segment === "all" ? undefined : segment)) as CustomerListFilters["segment"],
      cluster: overrides && "cluster" in overrides
        ? overrides.cluster
        : cluster === "all"
          ? undefined
          : cluster === "unassigned"
            ? "unassigned"
            : Number(cluster),
      recency: (overrides?.recency ?? (recency === "all" ? undefined : recency)) as CustomerListFilters["recency"],
      sort: overrides?.sort ?? sort,
      dir: overrides?.dir ?? dir,
    };
    const id = overrides && "id" in overrides ? overrides.id : selectedCustomer?.id;
    router.replace(buildCustomerQuery(next, { id: id ?? undefined }));
  }

  function onFilter(event: React.FormEvent) {
    event.preventDefault();
    applyFilters({ search: query.trim() || undefined, id: selectedCustomer?.id });
  }

  function applyPreset(nextSegment: "Champions" | "At Risk" | "unclassified") {
    setSegment(nextSegment);
    applyFilters({ segment: nextSegment, search: query.trim() || undefined, id: undefined });
  }

  return (
    <div className="space-y-4">
      <form className="grid gap-2 md:grid-cols-6" onSubmit={onFilter}>
        <div className="relative md:col-span-2">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tên hoặc SĐT"
          />
        </div>
        <Select value={segment} onValueChange={setSegment}>
          <SelectTrigger><SelectValue placeholder="Segment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả segment</SelectItem>
            {RFM_SEGMENTS.map((seg) => (
              <SelectItem key={seg} value={seg}>{rfmSegmentLabel(seg)}</SelectItem>
            ))}
            <SelectItem value="unclassified">Chưa phân loại</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cluster} onValueChange={setCluster}>
          <SelectTrigger><SelectValue placeholder="Nhóm" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả nhóm</SelectItem>
            {clusterIds.map((id) => (
              <SelectItem key={id} value={String(id)}>{clusterLabel(id)}</SelectItem>
            ))}
            <SelectItem value="unassigned">Chưa gán nhóm</SelectItem>
          </SelectContent>
        </Select>
        <Select value={recency} onValueChange={setRecency}>
          <SelectTrigger><SelectValue placeholder="Recency" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi recency</SelectItem>
            <SelectItem value="recent">Gần đây (≤30 ngày)</SelectItem>
            <SelectItem value="at_risk">Sắp mất (31-90 ngày)</SelectItem>
            <SelectItem value="dormant">Ngủ đông (hơn 90 ngày)</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Select value={sort} onValueChange={(value) => setSort(value as CustomerListFilters["sort"])}>
            <SelectTrigger><SelectValue placeholder="Sắp xếp" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monetary">Chi tiêu</SelectItem>
              <SelectItem value="recency">Recency</SelectItem>
              <SelectItem value="frequency">Tần suất</SelectItem>
              <SelectItem value="name">Tên</SelectItem>
              <SelectItem value="created_at">Ngày tạo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dir} onValueChange={(value) => setDir(value as "asc" | "desc")}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Giảm</SelectItem>
              <SelectItem value="asc">Tăng</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" variant="outline">Lọc</Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={segment === "Champions" ? "default" : "outline"} onClick={() => applyPreset("Champions")}>
          Champion
        </Button>
        <Button type="button" size="sm" variant={segment === "At Risk" ? "default" : "outline"} onClick={() => applyPreset("At Risk")}>
          Sắp mất
        </Button>
        <Button type="button" size="sm" variant={segment === "unclassified" ? "default" : "outline"} onClick={() => applyPreset("unclassified")}>
          Chưa phân loại
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{total.toLocaleString("vi-VN")} khách</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState title="Không có khách hàng" description="Thử đổi bộ lọc hoặc lưu SĐT khi bán hàng." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên</TableHead>
                  <TableHead>SĐT</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead className="text-right">Recency</TableHead>
                  <TableHead className="text-right">Tần suất</TableHead>
                  <TableHead className="text-right">Chi tiêu</TableHead>
                  <TableHead>Nhóm</TableHead>
                  <TableHead className="text-right">Đánh giá TB</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() => applyFilters({ id: row.id })}
                  >
                    <TableCell className="font-medium">{row.displayName}</TableCell>
                    <TableCell>{row.phone ?? "—"}</TableCell>
                    <TableCell>
                      {row.rfmSegment ? (
                        <Badge variant={SEGMENT_VARIANT[row.rfmSegment]}>{rfmSegmentLabel(row.rfmSegment)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">Chưa phân loại</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{row.recencyDays == null ? "—" : `${row.recencyDays} ngày`}</TableCell>
                    <TableCell className="text-right">{row.frequency == null ? "—" : row.frequency.toLocaleString("vi-VN")}</TableCell>
                    <TableCell className="text-right font-medium">{row.monetary == null ? "—" : formatVND(row.monetary)}</TableCell>
                    <TableCell>{clusterLabel(row.clusterId)}</TableCell>
                    <TableCell className="text-right">{row.avgRating == null ? "—" : row.avgRating.toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CustomerDetailDialog
        customer={selectedCustomer}
        canManage={canManage}
        onClose={() => applyFilters({ id: null })}
        onEdit={() => setEditing(true)}
      />
      <CustomerEditDialog
        customer={selectedCustomer}
        open={editing}
        onOpenChange={setEditing}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
