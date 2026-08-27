"use client";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCategory } from "@/server/actions/menu";
import type { MenuCategory, MenuType } from "@/types/database";

export const MENU_TYPE_LABEL: Record<MenuType, string> = {
  food: "Đồ ăn",
  drink: "Đồ uống",
  service: "Dịch vụ",
  other: "Khác",
};

const CREATE_NEW = "__create_new__";

export async function ensureCategoryId(
  organizationId: string,
  input: { categoryId: string | null; newCategoryName: string; menuType: MenuType },
  sortOrder: number
): Promise<{ categoryId: string | null; error?: string }> {
  if (!input.newCategoryName) return { categoryId: input.categoryId };
  const res = await createCategory(organizationId, {
    name: input.newCategoryName,
    menuType: input.menuType,
    sortOrder,
  });
  if (!res.ok) return { categoryId: null, error: res.error.message };
  return { categoryId: res.data.id };
}

export function CategoryFields({
  organizationId,
  categories,
  defaultCategoryId,
  defaultMenuType,
  onGroupCreated,
}: {
  organizationId: string;
  categories: MenuCategory[];
  defaultCategoryId?: string | null;
  defaultMenuType?: MenuType;
  onGroupCreated?: () => void;
}) {
  const initial = categories.find((c) => c.id === defaultCategoryId) ?? null;
  const [menuType, setMenuType] = useState<MenuType>(initial?.menu_type ?? defaultMenuType ?? "food");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "none");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [extras, setExtras] = useState<MenuCategory[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const groups = useMemo(() => {
    const base = categories.filter((c) => c.menu_type === menuType);
    const extra = extras.filter((c) => c.menu_type === menuType && !base.some((b) => b.id === c.id));
    return [...base, ...extra];
  }, [categories, extras, menuType]);

  async function confirmNewGroup() {
    const name = draftName.trim();
    if (!name) return;
    setCreateError(null);
    const res = await createCategory(organizationId, {
      name,
      menuType,
      sortOrder: categories.length + extras.length,
    });
    if (!res.ok) {
      setCreateError(res.error.message);
      return;
    }
    const created: MenuCategory = {
      id: res.data.id,
      organization_id: organizationId,
      parent_id: null,
      name,
      sort_order: categories.length + extras.length,
      menu_type: menuType,
      created_at: "",
      updated_at: "",
    };
    setExtras((rows) => [...rows, created]);
    setCategoryId(created.id);
    setCreating(false);
    setNewName("");
    setDraftName("");
    onGroupCreated?.();
  }

  const showCreateInput = creating && !newName;

  return (
    <div className="space-y-3">
      <input type="hidden" name="menuType" value={menuType} />
      <input type="hidden" name="categoryId" value={creating ? "none" : categoryId} />
      <input type="hidden" name="newCategoryName" value={creating ? newName : ""} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Loại</Label>
          <Select
            value={menuType}
            onValueChange={(value) => {
              const next = value as MenuType;
              setMenuType(next);
              setCreating(false);
              setNewName("");
              setDraftName("");
              const current = categories.find((c) => c.id === categoryId);
              if (current && current.menu_type !== next) setCategoryId("none");
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(MENU_TYPE_LABEL) as MenuType[]).map((type) => (
                <SelectItem key={type} value={type}>{MENU_TYPE_LABEL[type]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Nhóm món</Label>
          <Select
            value={categoryId || "none"}
            onValueChange={(value) => {
              if (value === CREATE_NEW) {
                setCreating(true);
                setNewName("");
                setDraftName("");
                setCategoryId("none");
                return;
              }
              if (!value) return;
              setCreating(false);
              setNewName("");
              setDraftName("");
              setCategoryId(value);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chưa gán" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Chưa gán</SelectItem>
              {groups.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
              <SelectItem value={CREATE_NEW}>Tạo nhóm mới</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {showCreateInput ? (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="newGroupName">Tên nhóm mới</Label>
            <Input
              id="newGroupName"
              autoFocus
              placeholder="Nhập tên nhóm"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void confirmNewGroup();
                }
              }}
            />
          </div>
          <Button type="button" disabled={!draftName.trim()} onClick={() => void confirmNewGroup()}>
            Thêm
          </Button>
        </div>
      ) : null}
      {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
    </div>
  );
}
