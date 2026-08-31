"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { changeEmployeeStatus, saveEmployee } from "@/server/actions/employees";
import type { Employee, EmployeeRole } from "@/types/database";

type Branch = { id: string; name: string };
type EmployeeRow = Employee & { branch?: Branch | null; role?: EmployeeRole | null };
const emptyForm = {
  fullName: "",
  phoneNumber: "",
  email: "",
  roleId: "",
  branchId: "",
  status: "ACTIVE" as Employee["status"],
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
};
const statusLabels = { ACTIVE: "Đang làm", INACTIVE: "Tạm nghỉ", RESIGNED: "Đã nghỉ việc" };

export function EmployeeManagement({
  employees,
  roles,
  branches,
  organizationId,
  currentBranchId,
}: {
  employees: EmployeeRow[];
  roles: EmployeeRole[];
  branches: Branch[];
  organizationId: string;
  currentBranchId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isMultiBranchAdmin = branches.length > 1;

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, branchId: currentBranchId });
    setMessage(null);
    setOpen(true);
  };

  const openEdit = (employee: EmployeeRow) => {
    setEditing(employee);
    setForm({
      fullName: employee.full_name,
      phoneNumber: employee.phone_number ?? "",
      email: employee.email ?? "",
      roleId: employee.role_id ?? "",
      branchId: employee.branch_id,
      status: employee.status,
      startDate: employee.start_date,
      endDate: employee.end_date ?? "",
    });
    setMessage(null);
    setOpen(true);
  };

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = () =>
    startTransition(async () => {
      setMessage(null);
      const result = await saveEmployee(organizationId, {
        ...form,
        id: editing?.id,
        roleId: form.roleId || null,
        email: form.email || null,
        phoneNumber: form.phoneNumber || null,
        endDate: form.endDate || null,
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setOpen(false);
      setMessage("Đã lưu hồ sơ nhân viên.");
      router.refresh();
    });

  const changeStatus = (employee: EmployeeRow, status: "INACTIVE" | "RESIGNED") => {
    const label = status === "RESIGNED" ? "cho nghỉ việc" : "tạm ngưng";
    if (!window.confirm(`Bạn chắc chắn muốn ${label} ${employee.full_name}?`)) return;
    startTransition(async () => {
      const result = await changeEmployeeStatus(organizationId, employee.id, status);
      if (!result.ok) setMessage(result.error.message);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <UserPlus className="mr-2 h-4 w-4" /> Thêm nhân viên
        </Button>
      </div>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã NV</TableHead>
            <TableHead>Nhân viên</TableHead>
            {isMultiBranchAdmin && <TableHead>Chi nhánh</TableHead>}
            <TableHead>Vai trò</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isMultiBranchAdmin ? 6 : 5} className="py-8 text-center text-muted-foreground">
                Chưa có nhân viên tại chi nhánh này.
              </TableCell>
            </TableRow>
          ) : (
            employees.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell className="font-mono text-xs">{employee.employee_code}</TableCell>
                <TableCell>
                  <div className="font-medium">{employee.full_name}</div>
                  <div className="text-xs text-muted-foreground">{employee.email || employee.phone_number || "Chưa có thông tin liên hệ"}</div>
                </TableCell>
                {isMultiBranchAdmin && <TableCell className="text-sm">{employee.branch?.name || "—"}</TableCell>}
                <TableCell>{employee.role?.name || "Chưa gán vai trò"}</TableCell>
                <TableCell>
                  <Badge variant={employee.status === "ACTIVE" ? "default" : "secondary"}>{statusLabels[employee.status]}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(employee)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Sửa
                    </Button>
                    {employee.status === "ACTIVE" ? (
                      <Button variant="ghost" size="sm" onClick={() => changeStatus(employee, "INACTIVE")}>
                        Tạm nghỉ
                      </Button>
                    ) : null}
                    {employee.status !== "RESIGNED" ? (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => changeStatus(employee, "RESIGNED")}>
                        Cho nghỉ
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setEditing(null);
            setForm(emptyForm);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Sửa hồ sơ nhân viên" : "Thêm nhân viên"}</DialogTitle>
            <DialogDescription>Mã nhân viên được hệ thống sinh tự động và không thể sửa.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="employee-name">Họ và tên</Label>
              <Input id="employee-name" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="employee-phone">Số điện thoại</Label>
              <Input id="employee-phone" value={form.phoneNumber} onChange={(e) => set("phoneNumber", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="employee-email">Email</Label>
              <Input id="employee-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            {isMultiBranchAdmin && (
              <div className="space-y-1">
                <Label htmlFor="employee-branch">Chi nhánh</Label>
                <select
                  id="employee-branch"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.branchId}
                  onChange={(e) => set("branchId", e.target.value)}
                >
                  <option value="">Chọn chi nhánh</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="employee-role">Vai trò</Label>
              <select
                id="employee-role"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.roleId}
                onChange={(e) => set("roleId", e.target.value)}
              >
                <option value="">Chưa gán vai trò</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                    {role.is_system_admin ? " (toàn quyền)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="employee-start">Ngày bắt đầu</Label>
              <Input id="employee-start" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </div>
            {editing ? (
              <div className="space-y-1">
                <Label htmlFor="employee-status">Trạng thái</Label>
                <select
                  id="employee-status"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                >
                  <option value="ACTIVE">Đang làm</option>
                  <option value="INACTIVE">Tạm nghỉ</option>
                  <option value="RESIGNED">Đã nghỉ việc</option>
                </select>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setEditing(null);
                setForm(emptyForm);
              }}
            >
              Hủy
            </Button>
            <Button onClick={submit} disabled={pending || !form.fullName || !form.branchId}>
              {pending ? "Đang lưu..." : "Lưu hồ sơ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
