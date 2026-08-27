"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileBarChart, FileText } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ReportsTabs({ canDocuments }: { canDocuments: boolean }) {
  const pathname = usePathname();
  const value = pathname.startsWith("/reports/documents") ? "documents" : "end-of-day";

  return (
    <Tabs value={value}>
      <TabsList>
        <TabsTrigger value="end-of-day" asChild>
          <Link href="/reports/end-of-day" className="gap-1.5">
            <FileBarChart className="h-4 w-4" />
            Báo cáo cuối ngày
          </Link>
        </TabsTrigger>
        {canDocuments && (
          <TabsTrigger value="documents" asChild>
            <Link href="/reports/documents" className="gap-1.5">
              <FileText className="h-4 w-4" />
              Chứng từ thuế
            </Link>
          </TabsTrigger>
        )}
      </TabsList>
    </Tabs>
  );
}
