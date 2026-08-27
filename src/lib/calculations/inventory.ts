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
