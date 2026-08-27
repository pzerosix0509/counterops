"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rocket, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedAuthIcon } from "@/components/common/animated-auth-icon-lazy";
import { createOrganizationWithFirstBranch } from "@/server/actions/onboarding";

export function OnboardingForm({ email, userId }: { email: string; userId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const form = new FormData(e.currentTarget);
    const payload = {
      organizationName: String(form.get("organizationName") || "").trim(),
      organizationSlug: String(form.get("organizationSlug") || "").trim().toLowerCase(),
      businessType: String(form.get("businessType") || "restaurant"),
      branchName: String(form.get("branchName") || "").trim(),
      branchAddress: String(form.get("branchAddress") || "") || null,
      branchPhone: String(form.get("branchPhone") || "") || null,
    };
    startTransition(async () => {
      const result = await createOrganizationWithFirstBranch(payload);
      if (!result.ok) {
        setError(result.error.message);
        if (result.error.fieldErrors) setFieldErrors(result.error.fieldErrors);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader className="items-center text-center">
        <AnimatedAuthIcon icon={Store} pending={isPending} />
        <CardTitle className="text-lg">Tạo cửa hàng đầu tiên</CardTitle>
        <CardDescription>
          Bạn sẽ trở thành chủ sở hữu. Tài khoản: <span className="font-mono">{email || userId}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={onSubmit}>
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Thông tin cửa hàng
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="organizationName">Tên cửa hàng</Label>
                <Input id="organizationName" name="organizationName" placeholder="VD: Quán cà phê Trang" required />
                {fieldErrors.organizationName?.map((m) => <p key={m} className="text-xs text-destructive">{m}</p>)}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="organizationSlug">Mã định danh (slug)</Label>
                <Input id="organizationSlug" name="organizationSlug" placeholder="vi-du: quan-cafe-trang" required />
                {fieldErrors.organizationSlug?.map((m) => <p key={m} className="text-xs text-destructive">{m}</p>)}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Chi nhánh đầu tiên
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="branchName">Tên chi nhánh</Label>
                <Input id="branchName" name="branchName" required defaultValue="Chi nhánh trung tâm" />
                {fieldErrors.branchName?.map((m) => <p key={m} className="text-xs text-destructive">{m}</p>)}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="branchPhone">Số điện thoại</Label>
                <Input id="branchPhone" name="branchPhone" placeholder="09xx xxx xxx" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branchAddress">Địa chỉ</Label>
              <Textarea id="branchAddress" name="branchAddress" rows={2} placeholder="Số nhà, đường, quận/huyện..." />
            </div>
          </div>
          <input type="hidden" name="businessType" value="restaurant" />
          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={isPending} className="w-full" size="lg">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {isPending ? "Đang tạo..." : "Tạo cửa hàng"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
