import dynamic from "next/dynamic";
import { canManageCustomers, canViewCustomers, getActiveMembership, requireActiveContext } from "@/lib/auth/permissions";
import { parseCustomerListFilters } from "@/lib/customers/list";
import { getCustomerDetail, listCustomersWithFeatures } from "@/server/queries/customers";

const CustomersManager = dynamic(
  () => import("@/components/customers/customers-manager").then((m) => ({ default: m.CustomersManager })),
  { loading: () => <p className="text-sm text-muted-foreground">Đang tải danh sách khách...</p> }
);

export const metadata = { title: "Khách hàng" };

interface PageProps {
  searchParams: {
    q?: string;
    segment?: string;
    cluster?: string;
    recency?: string;
    sort?: string;
    dir?: string;
    id?: string;
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CustomersPage({ searchParams }: PageProps) {
  const active = await getActiveMembership();
  if (!active) return null;
  if (!canViewCustomers.includes(active.role)) {
    return <div className="rounded-md border bg-card p-6 text-sm">Bạn không có quyền xem khách hàng.</div>;
  }

  const ctx = await requireActiveContext();
  const filters = parseCustomerListFilters(searchParams);
  const selectedId = searchParams.id && UUID_RE.test(searchParams.id) ? searchParams.id : undefined;
  const [{ rows, total, clusterIds }, selectedCustomer] = await Promise.all([
    listCustomersWithFeatures(ctx.organizationId, ctx.branchId, filters),
    selectedId ? getCustomerDetail(selectedId, ctx.organizationId, ctx.branchId) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Khách hàng</h1>
        <p className="text-sm text-muted-foreground">
          Danh sách khách theo chi nhánh hiện tại, kèm phân khúc RFM và nhóm hành vi.
        </p>
      </div>
      <CustomersManager
        rows={rows}
        total={total}
        clusterIds={clusterIds}
        filters={filters}
        selectedCustomer={selectedCustomer}
        canManage={canManageCustomers.includes(active.role)}
      />
    </div>
  );
}
