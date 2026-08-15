import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeatureDemoProvider } from "./feature-demo-context";
import { FeatureDemoPanel } from "./feature-demo-panel";
import { FeaturesGrid } from "./features-grid";

interface ProofStat {
  value: string;
  label: string;
}

interface Step {
  title: string;
  description: string;
}

const PROOF_STATS: ProofStat[] = [
  { value: "2 phút", label: "Để tạo cửa hàng và bắt đầu" },
  { value: "1 giây", label: "Đồng bộ đơn hàng tới bếp và kho" },
  { value: "1 click", label: "Xuất báo cáo cuối ngày ra Excel" },
  { value: "24/7", label: "AI trợ lý sẵn sàng hỗ trợ" },
];

const STEPS: Step[] = [
  {
    title: "Tạo cửa hàng",
    description: "Đăng ký tài khoản và khai báo thông tin quán, chỉ mất khoảng 2 phút.",
  },
  {
    title: "Nhập thực đơn & mặt bằng",
    description: "Thêm món ăn, bàn, khu vực và danh mục kho bằng cách nhập tay hoặc kéo file Excel.",
  },
  {
    title: "Bắt đầu bán hàng",
    description: "Nhận đơn, điều phối bếp, theo dõi kho và chốt doanh thu cuối ngày ngay từ ngày đầu tiên.",
  },
];

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>CounterOps</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Đăng nhập</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/onboarding">Tạo cửa hàng</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className="border-b bg-gradient-to-b from-muted/50 to-background">
      <div className="mx-auto max-w-6xl px-4 pt-20 pb-16 md:px-6 md:pt-28 md:pb-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <Badge variant="info">Bán hàng POS · Bếp · Kho · Báo cáo · AI</Badge>
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">
            Vận hành quán ăn trong một màn hình duy nhất
          </h1>
          <p className="text-balance text-base text-muted-foreground md:text-lg">
            Bán hàng, điều phối bếp, quản lý bàn, theo dõi kho và chốt doanh thu cuối ngày — mọi
            nghiệp vụ của quán đồng bộ realtime trên mọi thiết bị.
          </p>
          <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/onboarding">
                Bắt đầu miễn phí
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Đăng nhập</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Không cần thẻ tín dụng · Không giới hạn thời gian dùng thử
          </p>
        </div>
      </div>
    </section>
  );
}

function ProofStrip() {
  return (
    <section className="border-b">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-12 md:grid-cols-4 md:px-6">
        {PROOF_STATS.map((stat) => (
          <div key={stat.value} className="flex flex-col gap-1 text-center md:text-left">
            <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium text-muted-foreground">Tính năng</p>
        <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight md:text-4xl">
          Mọi nghiệp vụ của quán trong một hệ thống
        </h2>
        <p className="mt-3 text-muted-foreground">
          Thay bảng tính và sổ ghi chú bằng một nền tảng đồng bộ realtime, thiết kế riêng cho quán
          ăn, cà phê và nhà hàng.
        </p>
      </div>
      <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <FeaturesGrid />
        <div className="hidden lg:sticky lg:top-24 lg:block">
          <FeatureDemoPanel />
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section className="border-t bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-muted-foreground">Cách hoạt động</p>
          <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight md:text-4xl">
            Sẵn sàng kinh doanh trong 3 bước
          </h2>
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="flex flex-col gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-md border bg-background text-sm font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
      <div className="mx-auto max-w-2xl rounded-lg border bg-card p-8 text-center shadow-sm md:p-12">
        <h2 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">
          Sẵn sàng vận hành quán thông minh hơn?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Tạo cửa hàng miễn phí, không cần thẻ tín dụng. Bạn có thể chốt đơn ngay trong buổi đầu
          tiên.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/onboarding">
              Tạo cửa hàng miễn phí
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Đăng nhập</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 md:flex-row md:px-6">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>CounterOps</span>
        </div>
        <p className="text-sm text-muted-foreground">© 2026 CocunterOps</p>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/login" className="transition-colors hover:text-foreground">
            Đăng nhập
          </Link>
          <Link href="/onboarding" className="transition-colors hover:text-foreground">
            Tạo cửa hàng
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <FeatureDemoProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1">
          <HeroSection />
          <ProofStrip />
          <FeaturesSection />
          <HowItWorksSection />
          <FinalCtaSection />
        </main>
        <Footer />
      </div>
    </FeatureDemoProvider>
  );
}
