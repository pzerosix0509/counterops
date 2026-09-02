"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserPlus, Mail, Eye, KeyRound, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  changeEmployeeStatus,
  saveEmployee,
  createEmployeeWithAuth,
  provisionAccountForEmployee,
  deleteEmployee,
  resetPasswordForEmployee,
} from "@/server/actions/employees";
import { CredentialsModal } from "./credentials-modal";
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
  createAuthAccount: false,
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

  // Credentials modal (shared between create-with-auth & retroactive provision)
  const [credsModal, setCredsModal] = useState<{ open: boolean; email: string; password: string; name: string }>({
    open: false,
    email: "",
    password: "",
    name: "",
  });

  // Provision account modal state
  const [provisionModal, setProvisionModal] = useState<{
    open: boolean;
    employee: EmployeeRow | null;
    email: string;
    error: string | null;
  }>({ open: false, employee: null, email: "", error: null });

  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    employee: EmployeeRow | null;
    error: string | null;
  }>({ open: false, employee: null, error: null });

  const isMultiBranchAdmin = branches.length > 1;

  // Separate employees by status
  const activeEmployees = employees.filter((e) => e.status !== "RESIGNED");
  const resignedEmployees = employees.filter((e) => e.status === "RESIGNED");

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
      createAuthAccount: false,
    });
    setMessage(null);
    setOpen(true);
  };

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = () =>
    startTransition(async () => {
      setMessage(null);

      // If editing or not creating with auth, use regular saveEmployee
      if (editing || !form.createAuthAccount) {
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
        return;
      }

      // Create with auth account
      const result = await createEmployeeWithAuth(organizationId, {
        fullName: form.fullName,
        phoneNumber: form.phoneNumber || null,
        email: form.email,
        roleId: form.roleId,
        branchId: form.branchId,
        createAuthAccount: true,
        startDate: form.startDate,
      });

      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }

      // Show credentials modal
      setCredsModal({
        open: true,
        email: result.data.email,
        password: result.data.tempPassword,
        name: form.fullName,
      });

      setOpen(false);
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

  // ─── Provision account modal handlers ────────────────────────────────────

  const openProvision = (employee: EmployeeRow) => {
    setProvisionModal({
      open: true,
      employee,
      email: employee.email ?? "",
      error: null,
    });
  };

  const submitProvision = () =>
    startTransition(async () => {
      const { employee, email } = provisionModal;
      if (!employee) return;
      setProvisionModal((s) => ({ ...s, error: null }));

      const result = await provisionAccountForEmployee(organizationId, employee.id, email);
      if (!result.ok) {
        setProvisionModal((s) => ({ ...s, error: result.error.message }));
        return;
      }

      setProvisionModal({ open: false, employee: null, email: "", error: null });
      setCredsModal({
        open: true,
        email: result.data.email,
        password: result.data.tempPassword,
        name: employee.full_name,
      });
      router.refresh();
    });

  // ─── Delete modal handlers ────────────────────────────────────────────────

  const openDelete = (employee: EmployeeRow) => {
    setDeleteModal({ open: true, employee, error: null });
  };

  const submitDelete = () =>
    startTransition(async () => {
      const { employee } = deleteModal;
      if (!employee) return;
      setDeleteModal((s) => ({ ...s, error: null }));

      const result = await deleteEmployee(organizationId, employee.id);
      if (!result.ok) {
        setDeleteModal((s) => ({ ...s, error: result.error.message }));
        return;
      }

      setDeleteModal({ open: false, employee: null, error: null });
      router.refresh();
    });

  // ─── Reset password handlers ──────────────────────────────────────────────

  const submitResetPassword = (employee: EmployeeRow) =>
    startTransition(async () => {
      const result = await resetPasswordForEmployee(organizationId, employee.id);
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setCredsModal({
        open: true,
        email: result.data.email,
        password: result.data.tempPassword,
        name: employee.full_name,
      });
    });

  // ─── Row-level action helpers ─────────────────────────────────────────────

  /** An employee can only be hard-deleted when they have no linked auth account.
   *  Additional FK constraints in Postgres act as the final safety net. */
  const canHardDelete = (employee: EmployeeRow) => !employee.user_id;

  // ─── Table rows sub-component ─────────────────────────────────────────────

  const EmployeeTableRows = ({ employees: rows, isResigned }: { employees: EmployeeRow[]; isResigned: boolean }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mã NV</TableHead>
          <TableHead>Nhân viên</TableHead>
          {isMultiBranchAdmin && <TableHead>Chi nhánh</TableHead>}
          <TableHead>Vai trò</TableHead>
          <TableHead>Tài khoản</TableHead>
          {!isResigned && <TableHead>Trạng thái</TableHead>}
          <TableHead className="text-right">Thao tác</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={isMultiBranchAdmin ? (isResigned ? 6 : 7) : isResigned ? 5 : 6}
              className="py-8 text-center text-muted-foreground"
            >
              {isResigned ? "Chưa có nhân viên đã nghỉ việc." : "Chưa có nhân viên tại chi nhánh này."}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((employee) => (
            <TableRow key={employee.id} className={isResigned ? "opacity-60" : ""}>
              <TableCell className="font-mono text-xs">{employee.employee_code}</TableCell>
              <TableCell>
                <div className="font-medium">{employee.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {employee.email || employee.phone_number || "Chưa có thông tin liên hệ"}
                </div>
              </TableCell>
              {isMultiBranchAdmin && <TableCell className="text-sm">{employee.branch?.name || "—"}</TableCell>}
              <TableCell>{employee.role?.name || "Chưa gán vai trò"}</TableCell>
              <TableCell>
                {employee.user_id ? (
                  <Badge variant="outline" className="gap-1">
                    <Mail className="h-3 w-3" /> Đã liên kết
                  </Badge>
                ) : (
                  <Badge variant="secondary">Chưa liên kết</Badge>
                )}
              </TableCell>
              {!isResigned && (
                <TableCell>
                  <Badge variant={employee.status === "ACTIVE" ? "default" : "secondary"}>
                    {statusLabels[employee.status]}
                  </Badge>
                </TableCell>
              )}
              <TableCell>
                <div className="flex flex-wrap justify-end gap-1">
                  {/* ── View / Edit ── */}
                  <Button variant="ghost" size="sm" onClick={() => openEdit(employee)}>
                    {isResigned ? (
                      <>
                        <Eye className="mr-1 h-3.5 w-3.5" /> Xem
                      </>
                    ) : (
                      <>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Sửa
                      </>
                    )}
                  </Button>

                  {!isResigned && (
                    <>
                      {/* ── Cấp tài khoản (retroactive) ── */}
                      {!employee.user_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 hover:text-blue-700"
                          onClick={() => openProvision(employee)}
                        >
                          <KeyRound className="mr-1 h-3.5 w-3.5" /> Cấp TK
                        </Button>
                      )}

                      {/* ── Cấp lại mật khẩu (reset for linked account) ── */}
                      {employee.user_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 hover:text-blue-700"
                          disabled={pending}
                          onClick={() => submitResetPassword(employee)}
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Cấp lại MK
                        </Button>
                      )}

                      {/* ── Tạm nghỉ ── */}
                      {employee.status === "ACTIVE" && (
                        <Button variant="ghost" size="sm" onClick={() => changeStatus(employee, "INACTIVE")}>
                          Tạm nghỉ
                        </Button>
                      )}

                      {/* ── Cho nghỉ việc ── */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => changeStatus(employee, "RESIGNED")}
                      >
                        Cho nghỉ
                      </Button>
                    </>
                  )}

                  {/* ── Xóa hồ sơ (hard delete, only when safe) ── */}
                  {canHardDelete(employee) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => openDelete(employee)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Xóa
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex cursor-not-allowed">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="pointer-events-none text-muted-foreground"
                            disabled
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" /> Xóa
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[220px] text-center text-xs">
                        Nhân viên đã có tài khoản hoặc dữ liệu lịch sử. Hãy dùng &quot;Cho nghỉ việc&quot;.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <UserPlus className="mr-2 h-4 w-4" /> Thêm nhân viên
        </Button>
      </div>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active">Đang làm việc ({activeEmployees.length})</TabsTrigger>
          <TabsTrigger value="resigned">Đã nghỉ việc ({resignedEmployees.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <EmployeeTableRows employees={activeEmployees} isResigned={false} />
        </TabsContent>
        <TabsContent value="resigned">
          <EmployeeTableRows employees={resignedEmployees} isResigned={true} />
        </TabsContent>
      </Tabs>

      {/* ── Create / Edit employee dialog ─────────────────────────────────── */}
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
              <Input
                id="employee-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
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
              <Input
                id="employee-start"
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </div>
            {!editing && (
              <div className="space-y-2 sm:col-span-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.createAuthAccount}
                    onChange={(e) => set("createAuthAccount", e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-blue-900">Tạo tài khoản đăng nhập</span>
                </label>
                <p className="text-xs text-blue-800">
                  Hệ thống sẽ sinh mật khẩu tạm thời để nhân viên có thể đăng nhập và sử dụng ứng dụng.
                </p>
              </div>
            )}
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
            <Button
              onClick={submit}
              disabled={
                pending || !form.fullName || !form.branchId || !form.roleId || (form.createAuthAccount && !form.email)
              }
            >
              {pending ? "Đang lưu..." : "Lưu hồ sơ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Retroactive provision account dialog ──────────────────────────── */}
      <Dialog
        open={provisionModal.open}
        onOpenChange={(open) => {
          if (!open) setProvisionModal({ open: false, employee: null, email: "", error: null });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-600" />
              Cấp tài khoản đăng nhập
            </DialogTitle>
            <DialogDescription>
              Tạo tài khoản đăng nhập cho{" "}
              <span className="font-semibold">{provisionModal.employee?.full_name}</span>. Hệ thống sẽ sinh mật khẩu
              tạm thời để chia sẻ với nhân viên.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="provision-email">Địa chỉ Email</Label>
              <Input
                id="provision-email"
                type="email"
                placeholder="nhanvien@example.com"
                value={provisionModal.email}
                onChange={(e) => setProvisionModal((s) => ({ ...s, email: e.target.value, error: null }))}
              />
              <p className="text-xs text-muted-foreground">
                Dùng email thật của nhân viên hoặc email dùng chung cho thiết bị POS (vd: pos1@branch.com).
              </p>
            </div>
            {provisionModal.error && (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {provisionModal.error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProvisionModal({ open: false, employee: null, email: "", error: null })}
            >
              Hủy
            </Button>
            <Button
              onClick={submitProvision}
              disabled={pending || !provisionModal.email.trim()}
            >
              {pending ? "Đang tạo..." : "Tạo tài khoản"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ─────────────────────────────────────── */}
      <Dialog
        open={deleteModal.open}
        onOpenChange={(open) => {
          if (!open) setDeleteModal({ open: false, employee: null, error: null });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Xóa hồ sơ nhân viên
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Bạn sắp xóa vĩnh viễn hồ sơ của{" "}
                  <span className="font-semibold">{deleteModal.employee?.full_name}</span> ({deleteModal.employee?.employee_code}).
                </p>
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  ⚠️ Hành động này không thể hoàn tác. Chỉ xóa khi hồ sơ được tạo nhầm và chưa có dữ liệu lịch sử.
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          {deleteModal.error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {deleteModal.error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteModal({ open: false, employee: null, error: null })}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={submitDelete}
              disabled={pending}
            >
              {pending ? "Đang xóa..." : "Xóa vĩnh viễn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Shared credentials modal ──────────────────────────────────────── */}
      <CredentialsModal
        open={credsModal.open}
        onOpenChange={(open) => setCredsModal({ ...credsModal, open })}
        email={credsModal.email}
        tempPassword={credsModal.password}
        employeeName={credsModal.name}
      />
    </div>
  );
}
