import type { AiForecastPoint, AiForecastResult, ForecastBacktestResult } from "@/types/ai";

const MIN_DAYS_REQUIRED = 14;
const DEFAULT_HORIZON_DAYS = 30;
/** Cần ít nhất 21 ngày để backtest (14 train + 7 test) */
const MIN_BACKTEST_DAYS = 21;
const BACKTEST_TEST_DAYS = 7;

interface DailyDataPoint {
  date: string; // ISO date string YYYY-MM-DD
  revenue: number;
  orders: number;
}

/**
 * Weighted moving average forecast. Recent days get higher weight.
 * Weight for day i (0 = oldest): (i + 1) / sum(1..n)
 */
function weightedMovingAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const totalWeight = (values.length * (values.length + 1)) / 2;
  return values.reduce((sum, value, index) => sum + value * (index + 1), 0) / totalWeight;
}

/**
 * Simple standard deviation for confidence interval width.
 */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Add N calendar days to a date string (YYYY-MM-DD).
 */
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Group timeseries rows (which may be hourly/weekly) into daily totals.
 */
export function aggregateToDailyPoints(
  rows: Array<{ period_start: string; net_revenue: number; total_orders: number }>,
): DailyDataPoint[] {
  const byDate = new Map<string, { revenue: number; orders: number }>();
  for (const row of rows) {
    const day = row.period_start.slice(0, 10);
    const existing = byDate.get(day) ?? { revenue: 0, orders: 0 };
    byDate.set(day, {
      revenue: existing.revenue + row.net_revenue,
      orders: existing.orders + row.total_orders,
    });
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totals]) => ({ date, ...totals }));
}

/**
 * Compute a weighted moving average forecast for the next `horizonDays` days.
 * Returns insufficient_data: true if fewer than MIN_DAYS_REQUIRED training days.
 */
export function computeForecast(
  dailyPoints: DailyDataPoint[],
  horizonDays = DEFAULT_HORIZON_DAYS,
): AiForecastResult {
  if (dailyPoints.length < MIN_DAYS_REQUIRED) {
    return {
      horizon_days: horizonDays,
      method: "weighted_moving_average",
      training_days: dailyPoints.length,
      points: [],
      insufficient_data: true,
      min_days_required: MIN_DAYS_REQUIRED,
    };
  }

  const revenues = dailyPoints.map((point) => point.revenue);
  const orders = dailyPoints.map((point) => point.orders);

  const forecastRevenue = weightedMovingAverage(revenues);
  const forecastOrders = weightedMovingAverage(orders);
  const revenueStd = stddev(revenues);
  // 1.5 sigma bounds for a reasonable confidence interval
  const margin = revenueStd * 1.5;

  const lastDate = dailyPoints.at(-1)!.date;
  const points: AiForecastPoint[] = Array.from({ length: horizonDays }, (_, index) => ({
    period_start: addDays(lastDate, index + 1),
    forecasted_revenue: Math.round(forecastRevenue),
    forecasted_orders: Math.round(forecastOrders),
    lower_bound: Math.round(Math.max(0, forecastRevenue - margin)),
    upper_bound: Math.round(forecastRevenue + margin),
  }));

  return {
    horizon_days: horizonDays,
    method: "weighted_moving_average",
    training_days: dailyPoints.length,
    points,
    insufficient_data: false,
    min_days_required: MIN_DAYS_REQUIRED,
  };
}

/**
 * Backtest forecast: cắt BACKTEST_TEST_DAYS ngày cuối làm test, train trên phần
 * còn lại (WMA), đo WMAPE + MASE (baseline = naive 1-step: giá trị hôm trước).
 * Trả null nếu < MIN_BACKTEST_DAYS ngày (cần đủ train + test).
 */
export function backtestForecast(
  dailyPoints: DailyDataPoint[],
): ForecastBacktestResult | null {
  if (dailyPoints.length < MIN_BACKTEST_DAYS) return null;

  const train = dailyPoints.slice(0, dailyPoints.length - BACKTEST_TEST_DAYS);
  const test = dailyPoints.slice(-BACKTEST_TEST_DAYS);

  // Train WMA trên phần train (dùng chính computeForecast để cùng phương pháp)
  const trainForecast = computeForecast(train, BACKTEST_TEST_DAYS);
  const forecastRevenues = trainForecast.points.map((point) => point.forecasted_revenue);

  const byHorizon: ForecastBacktestResult["byHorizon"] = [];
  for (let h = 0; h < BACKTEST_TEST_DAYS; h += 1) {
    const actual = test[h]?.revenue ?? 0;
    const predicted = forecastRevenues[h] ?? 0;
    const naive = h === 0 ? train.at(-1)?.revenue ?? 0 : test[h - 1]?.revenue ?? 0;
    const absError = Math.abs(actual - predicted);
    const naiveError = Math.abs(actual - naive);
    byHorizon.push({
      horizon: h + 1,
      wmape: actual > 0 ? absError / actual : null,
      mase: naiveError > 0 ? absError / Math.max(naiveError, 1) : null,
    });
  }

  const totalActual = test.reduce((sum, point) => sum + point.revenue, 0);
  const totalAbsError = byHorizon.reduce((sum, item) => sum + (item.wmape != null ? item.wmape * (test[item.horizon - 1]?.revenue ?? 0) : 0), 0);
  const wmape = totalActual > 0 ? totalAbsError / totalActual : null;

  const maseValues = byHorizon.map((item) => item.mase).filter((value): value is number => value != null);
  const mase = maseValues.length > 0
    ? maseValues.reduce((sum, value) => sum + value, 0) / maseValues.length
    : null;

  return {
    method: "weighted_moving_average",
    trainDays: train.length,
    testDays: test.length,
    wmape,
    mase,
    byHorizon,
    sampleSize: dailyPoints.length,
  };
}
