"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedAuthIcon } from "@/components/common/animated-auth-icon-lazy";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const supabase = createSupabaseBrowserClient();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // Step 1: Authenticate with Supabase (sets session cookie in browser)
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        return;
      }

      // Step 2: Full navigation to /auth/callback-redirect so the SERVER can
      // read the fresh session cookie and perform the correct RBAC redirect.
      // We use window.location.replace to avoid a stale React router state
      // that would trigger the "fetch failed" undici error when the server
      // action tries to read cookies before the Next.js router has refreshed.
      const destination = nextPath && nextPath !== "/" && nextPath !== "/dashboard"
        ? nextPath
        : "/auth/session-redirect";

      window.location.replace(destination);
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <AnimatedAuthIcon icon={Sparkles} pending={isPending} />
        <CardTitle className="text-lg">Đăng nhập</CardTitle>
        <CardDescription>
          Chào mừng trở lại! Nhập email và mật khẩu để tiếp tục.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Mật khẩu</Label>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" size="lg" disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {isPending ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>
        <Separator className="my-6" />
        <p className="text-center text-sm text-muted-foreground">
          Chưa có tài khoản?{" "}
          <Link href="/register" className="text-primary underline-offset-4 hover:underline">
            Đăng ký ngay
          </Link>{" "}
          ·{" "}
          <Link href="/onboarding" className="text-primary underline-offset-4 hover:underline">
            Tạo cửa hàng mới
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
