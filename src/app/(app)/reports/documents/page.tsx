import { getActiveMembership, canGenerateEod, requireActiveContext } from "@/lib/auth/permissions";
import { TaxDocumentsView } from "@/components/documents/tax-documents-view";

export const metadata = { title: "Chứng từ thuế" };

export default async function TaxDocumentsPage() {
  const active = await getActiveMembership();
  if (!active) return null;
  if (!canGenerateEod.includes(active.role)) {
    return <div className="rounded-md border bg-card p-6 text-sm">Bạn không có quyền truy cập chứng từ thuế.</div>;
  }
  await requireActiveContext();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Chứng từ thuế</h1>
        <p className="text-sm text-muted-foreground">
          Phòng trưng bày các mẫu chứng từ thuế — di chuột vào thẻ để xem chi tiết, bấm vào thẻ để xem mẫu PDF.
        </p>
      </div>
      <TaxDocumentsView />
    </div>
  );
}
