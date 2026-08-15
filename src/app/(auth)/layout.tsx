import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-muted/30">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-muted/50 to-background" aria-hidden />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] max-w-full -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" aria-hidden />
      <header className="relative z-10 grid grid-cols-3 items-center gap-4 px-4 py-5 md:px-6">
        <Button variant="ghost" size="sm" asChild className="justify-self-start text-muted-foreground hover:text-foreground">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Về trang chủ
          </Link>
        </Button>
        <Link href="/" className="flex items-center gap-2 justify-self-center text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>CounterOps</span>
        </Link>
        <div className="justify-self-end" aria-hidden />
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">{children}</main>
      <footer className="relative z-10 flex justify-center pb-6">
        <p className="text-xs text-muted-foreground">
          © 2026 CounterOps · Vận hành quán ăn trong một màn hình duy nhất
        </p>
      </footer>
    </div>
  );
}
