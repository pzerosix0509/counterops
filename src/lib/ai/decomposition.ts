/**
 * Driver decomposition — phân rã chênh lệch doanh thu, KHÔNG để model tự
 * suy đoán nguyên nhân.
 *
 * revenue_delta = Δorders × AOV_prev + ΔAOV × orders_current
 * (chuẩn: Δ(orders × AOV) = Δorders×AOV_prev + ΔAOV×orders_current)
 */

export interface RevenueDeltaDecomposition {
  currentRevenue: number;
  previousRevenue: number;
  delta: number;
  ordersEffect: number;
  aovEffect: number;
  /** Phần trăm chênh lệch giải thích bởi số đơn */
  ordersSharePct: number | null;
  /** Phần trăm chênh lệch giải thích bởi giá trị đơn trung bình */
  aovSharePct: number | null;
}

export function decomposeRevenueDelta(
  current: { revenue: number; orders: number },
  previous: { revenue: number; orders: number },
): RevenueDeltaDecomposition {
  const aovPrev = previous.orders > 0 ? previous.revenue / previous.orders : 0;
  const aovCurrent = current.orders > 0 ? current.revenue / current.orders : 0;
  const deltaOrders = current.orders - previous.orders;
  const deltaAov = aovCurrent - aovPrev;

  const ordersEffect = deltaOrders * aovPrev;
  const aovEffect = deltaAov * current.orders;
  const delta = current.revenue - previous.revenue;

  const absSum = Math.abs(ordersEffect) + Math.abs(aovEffect);
  const ordersSharePct = absSum > 0 ? (ordersEffect / absSum) * 100 : null;
  const aovSharePct = absSum > 0 ? (aovEffect / absSum) * 100 : null;

  return { currentRevenue: current.revenue, previousRevenue: previous.revenue, delta, ordersEffect, aovEffect, ordersSharePct, aovSharePct };
}

export interface DimensionContribution {
  name: string;
  current: number;
  previous: number;
  delta: number;
  /** Đóng góp vào tổng chênh lệch (đơn vị tiền) */
  contribution: number;
  /** Phần trăm đóng góp vào tổng chênh lệch (dấu theo hướng) */
  sharePct: number | null;
}

/**
 * Phân rã chênh lệch theo một dimension (kênh/món/nhóm) khi có dữ liệu
 * hai kỳ của từng thành phần. Nếu chỉ có một kỳ, trả về null.
 */
export function decomposeByDimension(
  currentRows: Array<{ name: string; value: number }>,
  previousRows: Array<{ name: string; value: number }>,
  _totalDelta: number,
): DimensionContribution[] | null {
  if (currentRows.length === 0 || previousRows.length === 0) return null;
  const prevMap = new Map(previousRows.map((row) => [row.name, row.value]));
  const names = Array.from(new Set([...currentRows.map((row) => row.name), ...Array.from(prevMap.keys())]));

  const absSum = names.reduce((sum, name) => {
    const current = currentRows.find((row) => row.name === name)?.value ?? 0;
    const previous = prevMap.get(name) ?? 0;
    return sum + Math.abs(current - previous);
  }, 0);

  const contributions: DimensionContribution[] = names.map((name) => {
    const current = currentRows.find((row) => row.name === name)?.value ?? 0;
    const previous = prevMap.get(name) ?? 0;
    const delta = current - previous;
    return {
      name,
      current,
      previous,
      delta,
      contribution: delta,
      sharePct: absSum > 0 ? (delta / absSum) * 100 : null,
    };
  }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return contributions;
}

/** Sinh văn bản mô tả decomposition cho deterministic answer */
export function describeDecomposition(decomp: RevenueDeltaDecomposition): string {
  const direction = decomp.delta >= 0 ? "tăng" : "giảm";
  const parts: string[] = [`Doanh thu ${direction} ${Math.abs(decomp.delta).toLocaleString("vi-VN")}₫`];
  if (decomp.ordersSharePct != null && decomp.aovSharePct != null) {
    const mainDriver = decomp.ordersSharePct >= decomp.aovSharePct ? "số đơn" : "giá trị đơn trung bình";
    parts.push(`chủ yếu do ${mainDriver} (đóng góp ${Math.round(Math.max(decomp.ordersSharePct, decomp.aovSharePct))}% biến động)`);
  }
  return parts.join(" — ");
}
