export const DEMAND_LOOKBACK_DAYS = 56;
export const DEMAND_MIN_OBSERVED_DAYS = 14;
export const DEMAND_DEFAULT_HORIZON = 14;
export const DEMAND_STALE_MS = 24 * 60 * 60 * 1000;

export interface DishForecastInput {
  productId: string;
  qty: number;
}

export interface RecipeBomLine {
  productId: string;
  inventoryItemId: string;
  quantityPerDish: number;
  unit: string;
}

export interface IngredientDemand {
  inventoryItemId: string;
  qty: number;
  unit: string;
}

export function explodeBom(
  dishForecasts: DishForecastInput[],
  recipes: RecipeBomLine[],
): IngredientDemand[] {
  const qtyByProduct = new Map<string, number>();
  for (const dish of dishForecasts) {
    qtyByProduct.set(dish.productId, (qtyByProduct.get(dish.productId) ?? 0) + dish.qty);
  }

  const byItem = new Map<string, IngredientDemand>();
  for (const line of recipes) {
    const dishQty = qtyByProduct.get(line.productId);
    if (!dishQty) continue;
    const add = dishQty * line.quantityPerDish;
    const existing = byItem.get(line.inventoryItemId);
    if (existing) {
      existing.qty += add;
    } else {
      byItem.set(line.inventoryItemId, {
        inventoryItemId: line.inventoryItemId,
        qty: add,
        unit: line.unit,
      });
    }
  }

  return Array.from(byItem.values());
}

export function purchaseHint(demand: number, onHand: number, safetyStock = 0): number {
  return Math.max(0, demand + safetyStock - onHand);
}

export function addCalendarDay(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function vnYmd(date: Date, timeZone = "Asia/Ho_Chi_Minh"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function fillDailySeries(
  points: Array<{ day: string; qty: number }>,
  startDay: string,
  endDay: string,
): number[] {
  const byDay = new Map<string, number>();
  for (const point of points) {
    byDay.set(point.day, (byDay.get(point.day) ?? 0) + Number(point.qty));
  }
  const series: number[] = [];
  for (let cursor = startDay; cursor <= endDay; cursor = addCalendarDay(cursor, 1)) {
    series.push(byDay.get(cursor) ?? 0);
  }
  return series;
}
