"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import { updateCustomer } from "@/server/actions/customers";
import type { CustomerDetail } from "@/types/customers";

function birthdayInput(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function CustomerEditDialog({
  customer,
  open,
  onOpenChange,
  onSaved,
}: {
  customer: CustomerDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) return;
    setError(null);
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await updateCustomer({
        id: customer.id,
        name: String(form.get("name") || ""),
        phone: String(form.get("phone") || ""),
        email: String(form.get("email") || ""),
        birthday: String(form.get("birthday") || ""),
        notes: String(form.get("notes") || ""),
      });
      if (!res.ok) {
        setError(res.error.message);
        notifyError("Không lưu được khách", res.error.message);
        return;
      }
      notifySuccess("Đã cập nhật khách hàng");
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={open && !!customer} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa khách hàng</DialogTitle>
          <DialogDescription>Cập nhật thông tin đã lưu. Không tạo khách mới tại đây.</DialogDescription>
        </DialogHeader>
        {customer ? (
          <form className="space-y-3" onSubmit={onSubmit}>
            <div className="space-y-1">
              <Label htmlFor="customer-name">Tên</Label>
              <Input id="customer-name" name="name" defaultValue={customer.name ?? ""} maxLength={120} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-phone">Số điện thoại</Label>
              <Input id="customer-phone" name="phone" defaultValue={customer.phone ?? ""} inputMode="tel" maxLength={20} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-email">Email</Label>
              <Input id="customer-email" name="email" type="email" defaultValue={customer.email ?? ""} maxLength={160} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-birthday">Sinh nhật</Label>
              <Input id="customer-birthday" name="birthday" type="date" defaultValue={birthdayInput(customer.birthday)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-notes">Ghi chú</Label>
              <Textarea id="customer-notes" name="notes" defaultValue={customer.notes ?? ""} maxLength={2000} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : "Lưu"}</Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
