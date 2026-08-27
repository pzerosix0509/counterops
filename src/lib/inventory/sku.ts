import type { InventoryItemType, MenuType } from "@/types/database";

export function normalizeItemName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function generateSkuCode(name: string): string {
  const ascii = normalizeItemName(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `${ascii || "SKU"}-${suffix}`;
}

export function flagsFromItemType(itemType: InventoryItemType): { canBeIngredient: boolean; canBeSold: boolean } {
  if (itemType === "sellable_product") return { canBeIngredient: false, canBeSold: true };
  return { canBeIngredient: true, canBeSold: false };
}

export function itemTypeFromFlags(canBeIngredient: boolean, canBeSold: boolean): InventoryItemType {
  if (canBeSold && !canBeIngredient) return "sellable_product";
  if (canBeSold && canBeIngredient) return "other";
  return "ingredient";
}

export function inferCategoryMenuType(name: string): MenuType {
  const n = name.trim().toLowerCase();
  if (["cà phê", "ca phe", "trà", "tra", "nước ép", "nuoc ep", "đồ uống", "do uong"].includes(n)) return "drink";
  if (["dịch vụ", "dich vu"].includes(n)) return "service";
  if (["khác", "khac"].includes(n)) return "other";
  if (["đồ ăn", "do an", "chiên", "chien", "luộc", "luoc", "mì", "mi"].includes(n)) return "food";
  return "food";
}
