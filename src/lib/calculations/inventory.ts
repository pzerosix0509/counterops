// Inventory deduction helpers.
export interface StockCheck {
  inventoryItemId: string;
  quantityAvailable: number;
  quantityNeeded: number;
}

export interface StockShortage {
  inventoryItemId: string;
  shortage: number;
}

export function findShortages(checks: StockCheck[]): StockShortage[] {
  return checks
    .filter((c) => c.quantityNeeded > c.quantityAvailable)
    .map((c) => ({ inventoryItemId: c.inventoryItemId, shortage: c.quantityNeeded - c.quantityAvailable }));
}

export function computeRecipeCost(items: { quantity: number; estimatedCost: number }[]): number {
  return items.reduce((sum, it) => sum + it.quantity * it.estimatedCost, 0);
}

/** Giá vốn 1 đơn vị món = round(sum(số lượng nguyên liệu × đơn giá kho)). */
export function computeBomCost(items: { quantity: number; unitCost: number }[]): number {
  return Math.round(items.reduce((sum, it) => sum + it.quantity * it.unitCost, 0));
}

export function expectedNetProfit(salePrice: number, recipeCost: number): number {
  return salePrice - recipeCost;
}

export function buildInventoryDeleteConflictMessage(productNames: string[]): string {
  if (productNames.length === 0) {
    return "Hàng đang dùng trong công thức món chế biến. Gỡ khỏi công thức trước khi xóa.";
  }
  const preview = productNames.slice(0, 6).map((name) => `• ${name}`).join("\n");
  const suffix = productNames.length > 6 ? `\n• ... và ${productNames.length - 6} món khác` : "";
  return `Hàng đang là nguyên liệu của ${productNames.length} món chế biến. Gỡ khỏi công thức trước khi xóa:\n${preview}${suffix}`;
}
