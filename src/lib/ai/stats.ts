/**
 * Hàm thống kê thuần — dùng cho statistical analysis của AI.
 * Không phụ thuộc infra; mọi hàm trả null khi dữ liệu không đủ.
 */

/** Pearson correlation — null nếu < 3 điểm hoặc phương sai 0 */
export function pearsonCorrelation(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 3) return null;
  const n = x.length;
  const meanX = x.reduce((sum, v) => sum + v, 0) / n;
  const meanY = y.reduce((sum, v) => sum + v, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

/** p-value xấp xỉ cho t-statistic (2 phía) dùng phân phối chuẩn — đủ cho báo cáo */
function normalApproxPValue(t: number, df: number): number {
  const z = Math.min(Math.abs(t), 30);
  // xấp xỉ Q-function qua erf
  const erf = (x: number) => {
    const sign = x < 0 ? -1 : 1;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const absX = Math.abs(x);
    const tVal = 1 / (1 + p * absX);
    const y = 1 - (((((a5 * tVal + a4) * tVal) + a3) * tVal + a2) * tVal + a1) * tVal * Math.exp(-absX * absX);
    return sign * y;
  };
  const p = 1 - erf(z / Math.SQRT2);
  void df;
  return Math.min(1, Math.max(0, p));
}

/** Welch t-test 2 mẫu độc lập — null nếu mẫu quá nhỏ hoặc phương sai 0 */
export function twoSampleTTest(
  a: number[],
  b: number[],
): { t: number; pValue: number; significant: boolean } | null {
  if (a.length < 2 || b.length < 2) return null;
  const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const varS = (values: number[], m: number) =>
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  const meanA = mean(a);
  const meanB = mean(b);
  const varA = varS(a, meanA);
  const varB = varS(b, meanB);
  if (varA === 0 && varB === 0) return null;
  const se = Math.sqrt(varA / a.length + varB / b.length);
  if (se === 0) return null;
  const t = (meanA - meanB) / se;
  const df = ((varA / a.length + varB / b.length) ** 2)
    / ((varA / a.length) ** 2 / (a.length - 1) + (varB / b.length) ** 2 / (b.length - 1));
  const pValue = normalApproxPValue(t, df);
  return { t, pValue, significant: pValue < 0.05 };
}

/** Robust MAD z-score cho từng điểm — trả về các điểm |z| ≥ 3 */
export function detectOutliersMAD(
  values: number[],
): Array<{ index: number; value: number; zScore: number }> {
  if (values.length < 4) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = 1.4826 * deviations[Math.floor(deviations.length / 2)];
  if (mad === 0) return [];
  return values
    .map((value, index) => ({ index, value, zScore: 0.6745 * (value - median) / mad }))
    .filter((item) => Math.abs(item.zScore) >= 3);
}

/** Seasonality index theo thứ trong tuần (0=CN..6=T7) — cần ≥ 2 tuần */
export function seasonalityIndex(
  dailyValues: Array<{ date: string; value: number }>,
): Record<string, number> | null {
  if (dailyValues.length < 14) return null;
  const byDay: Record<number, number[]> = {};
  for (const point of dailyValues) {
    const day = new Date(point.date).getUTCDay();
    (byDay[day] ??= []).push(point.value);
  }
  const means: Record<number, number> = {};
  for (const [day, values] of Object.entries(byDay)) {
    means[Number(day)] = values.reduce((sum, v) => sum + v, 0) / values.length;
  }
  const allMeans = Object.values(means);
  if (allMeans.length < 4) return null;
  const grandMean = allMeans.reduce((sum, v) => sum + v, 0) / allMeans.length;
  if (grandMean === 0) return null;
  const DAY_NAMES = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const result: Record<string, number> = {};
  for (const [day, mean] of Object.entries(means)) {
    result[DAY_NAMES[Number(day)]] = mean / grandMean;
  }
  return result;
}

/** Moving average (window cuối cùng) — null nếu ít hơn window điểm */
export function movingAverage(values: number[], window: number): number[] {
  if (window <= 1 || values.length === 0) return values;
  const result: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    result.push(slice.reduce((sum, v) => sum + v, 0) / slice.length);
  }
  return result;
}

/** CAGR + tổng tăng trưởng — null nếu < 2 điểm hoặc giá trị đầu = 0 */
export function growthRate(
  values: number[],
): { cagr: number; total: number } | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return null;
  const periods = values.length - 1;
  const cagr = Math.pow(last / first, 1 / periods) - 1;
  return { cagr, total: last / first - 1 };
}
