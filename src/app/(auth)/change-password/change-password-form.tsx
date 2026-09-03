"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { clearForcePasswordReset } from "@/server/actions/login";

export function ChangePasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const supabase = createSupabaseBrowserClient();

  function validate() {
    if (newPassword.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự.";
    if (newPassword !== confirmPassword) return "Mật khẩu xác nhận không khớp.";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);

    startTransition(async () => {
      // 1. Update password via Supabase client (uses the current session)
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      // 2. Clear the server-side flag
      const result = await clearForcePasswordReset();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      // 3. Full navigation so session-redirect can pick up the cleared flag
      window.location.replace("/auth/session-redirect");
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-lg">Đổi mật khẩu</CardTitle>
        <CardDescription>
          Đây là lần đầu bạn đăng nhập. Vui lòng đặt mật khẩu mới để bảo vệ tài khoản.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Mật khẩu mới</Label>
            <Input
              id="new-password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="Ít nhất 8 ký tự"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Xác nhận mật khẩu</Label>
            <Input
              id="confirm-password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu mới"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" size="lg" disabled={isPending || !newPassword || !confirmPassword}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {isPending ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

