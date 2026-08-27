import type { MenuType } from "@/types/database";

const MENU_TYPES: MenuType[] = ["food", "drink", "service", "other"];

export function readCategoryForm(form: FormData): {
  menuType: MenuType;
  categoryId: string | null;
  newCategoryName: string;
} {
  const rawType = String(form.get("menuType") || "food");
  const menuType = (MENU_TYPES.includes(rawType as MenuType) ? rawType : "food") as MenuType;
  const rawId = String(form.get("categoryId") || "none");
  const categoryId = rawId === "none" || !rawId ? null : rawId;
  const newCategoryName = String(form.get("newCategoryName") || "").trim();
  return { menuType, categoryId: newCategoryName ? null : categoryId, newCategoryName };
}
