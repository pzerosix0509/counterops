export type PosStockReason = "inactive" | "branch" | "stock" | null;

export interface PosProductStock {
  available: boolean;
  /** Số phần có thể bán; null = không theo dõi tồn kho */
  remainingQty: number | null;
  stockReason: PosStockReason;
}

export function maxPreparedPortions(
  recipeItems: Array<{ inventory_item_id: string; quantity: number }>,
  stockMap: Map<string, number>
): number | null {
  if (recipeItems.length === 0) return null;
  let max = Number.POSITIVE_INFINITY;
  for (const item of recipeItems) {
    const onHand = stockMap.get(item.inventory_item_id) ?? 0;
    const need = Number(item.quantity);
    if (need <= 0) continue;
    max = Math.min(max, Math.floor(onHand / need));
  }
  return Number.isFinite(max) ? Math.max(0, max) : 0;
}

export function resolveProductStock(input: {
  isActive: boolean;
  branchAvailable: boolean;
  productType: "regular" | "prepared";
  inventoryItemId: string | null;
  stockMap: Map<string, number>;
  recipeItems: Array<{ inventory_item_id: string; quantity: number }>;
}): PosProductStock {
  if (!input.isActive) {
    return { available: false, remainingQty: 0, stockReason: "inactive" };
  }
  if (!input.branchAvailable) {
    return { available: false, remainingQty: 0, stockReason: "branch" };
  }

  let remainingQty: number | null = null;
  if (input.productType === "regular" && input.inventoryItemId) {
    remainingQty = input.stockMap.get(input.inventoryItemId) ?? 0;
  } else if (input.productType === "prepared") {
    remainingQty = maxPreparedPortions(input.recipeItems, input.stockMap);
  }

  if (remainingQty !== null && remainingQty <= 0) {
    return { available: false, remainingQty: 0, stockReason: "stock" };
  }
  return { available: true, remainingQty, stockReason: null };
}

export function formatStockLabel(productName: string, stock: PosProductStock, requestedQty?: number): string {
  if (stock.stockReason === "inactive") return `${productName}: ngừng bán`;
  if (stock.stockReason === "branch") return `${productName}: tạm hết tại chi nhánh`;
  if (stock.remainingQty === null) return productName;

  if (requestedQty !== undefined && requestedQty > stock.remainingQty) {
    const short = requestedQty - stock.remainingQty;
    return `${productName}: thiếu ${short} (còn ${stock.remainingQty})`;
  }
  if (stock.remainingQty <= 0) {
    return `${productName}: không đủ (còn 0)`;
  }
  return productName;
}

export function formatStockBadge(stock: PosProductStock, requestedQty?: number): string | null {
  if (stock.stockReason === "inactive") return "Ngừng bán";
  if (stock.stockReason === "branch") return "Tạm hết";
  if (stock.remainingQty === null) return null;
  if (requestedQty !== undefined && requestedQty > stock.remainingQty) {
    return `Thiếu ${requestedQty - stock.remainingQty}`;
  }
  if (stock.remainingQty <= 0) return "Không đủ (còn 0)";
  return `Còn ${stock.remainingQty}`;
}
