import { AccessErrorCard } from "@/components/errors/access-error-card";

export const metadata = { title: "Lỗi truy cập" };

interface PageProps {
  searchParams: { code?: string };
}

export default function AccessErrorPage({ searchParams }: PageProps) {
  return <AccessErrorCard code={searchParams.code} />;
}
