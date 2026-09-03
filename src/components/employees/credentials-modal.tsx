"use client";

import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CredentialsModal({
  open,
  onOpenChange,
  email,
  tempPassword,
  employeeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  tempPassword: string;
  employeeName: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState<"email" | "password" | "all" | null>(null);

  const copyToClipboard = (text: string, type: "email" | "password" | "all") => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thông tin đăng nhập — {employeeName}</DialogTitle>
          <DialogDescription>
            Chia sẻ thông tin này với nhân viên. Họ sẽ được yêu cầu đổi mật khẩu lần đầu đăng nhập.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="creds-email">Email</Label>
            <div className="flex gap-2">
              <Input id="creds-email" value={email} readOnly className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(email, "email")}
              >
                {copied === "email" ? "Đã sao!" : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="creds-password">Mật khẩu tạm thời</Label>
            <div className="flex gap-2">
              <Input
                id="creds-password"
                type={showPassword ? "text" : "password"}
                value={tempPassword}
                readOnly
                className="flex-1 font-mono text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(tempPassword, "password")}
              >
                {copied === "password" ? "Đã sao!" : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <p className="font-medium">Lưu ý bảo mật</p>
            <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs">
              <li>Chia sẻ thông tin này trực tiếp hoặc qua kênh nội bộ an toàn.</li>
              <li>Nhân viên phải đổi mật khẩu ngay lần đầu đăng nhập.</li>
              <li>Không lưu mật khẩu tạm thời sau khi đã chia sẻ.</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đã hiểu
          </Button>
          <Button
            onClick={() => {
              copyToClipboard(`Email: ${email}\nMật khẩu tạm thời: ${tempPassword}`, "all");
            }}
          >
            {copied === "all" ? "Đã sao chép!" : "Sao chép tất cả"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
