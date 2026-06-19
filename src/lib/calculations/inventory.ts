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

export function expectedNetProfit(salePrice: number, recipeCost: number): number {
  return salePrice - recipeCost;
}
