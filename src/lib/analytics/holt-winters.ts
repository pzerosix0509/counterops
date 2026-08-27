const ALPHA = 0.3;
const BETA = 0.1;
const GAMMA = 0.3;
const MIN_DAYS = 14;
const CONFIDENCE_SIGMA = 1.5;

export type HoltWintersMethod = "holt_winters" | "holt_winters_fallback_ses";

export interface HoltWintersForecastResult {
  points: number[];
  lower: number[];
  upper: number[];
  method: HoltWintersMethod;
  insufficientData?: boolean;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function buildBands(
  points: number[],
  margin: number,
): { lower: number[]; upper: number[] } {
  return {
    lower: points.map((point) => Math.round(Math.max(0, point - margin))),
    upper: points.map((point) => Math.round(point + margin)),
  };
}

function levelOnlySesForecast(series: number[], horizon: number): HoltWintersForecastResult {
  let level = series[0];
  const errors: number[] = [];

  for (let t = 1; t < series.length; t++) {
    const oneStep = level;
    errors.push(series[t] - oneStep);
    level = ALPHA * series[t] + (1 - ALPHA) * level;
  }

  const margin = stddev(errors) * CONFIDENCE_SIGMA;
  const points = Array.from({ length: horizon }, () => Math.round(level));
  const { lower, upper } = buildBands(points, margin);

  return {
    points,
    lower,
    upper,
    method: "holt_winters_fallback_ses",
  };
}

function additiveHoltWinters(
  series: number[],
  horizon: number,
  season: number,
): HoltWintersForecastResult {
  const n = series.length;
  const season1 = series.slice(0, season);
  const season2 = series.slice(season, season * 2);

  let level = mean(season1);
  let trend = (mean(season2) - mean(season1)) / season;
  const seasonal = season1.map((value) => value - level);

  const errors: number[] = [];

  for (let t = 0; t < n; t++) {
    const seasonalIndex = t % season;
    const observed = series[t];

    if (t < season) {
      const fitted = level + trend * t + seasonal[seasonalIndex];
      errors.push(observed - fitted);
      continue;
    }

    const prevLevel = level;
    const prevSeasonal = seasonal[seasonalIndex];
    const oneStep = prevLevel + trend + prevSeasonal;
    errors.push(observed - oneStep);

    level = ALPHA * (observed - prevSeasonal) + (1 - ALPHA) * (prevLevel + trend);
    trend = BETA * (level - prevLevel) + (1 - BETA) * trend;
    seasonal[seasonalIndex] = GAMMA * (observed - level) + (1 - GAMMA) * prevSeasonal;
  }

  const margin = stddev(errors) * CONFIDENCE_SIGMA;
  const points = Array.from({ length: horizon }, (_, h) => {
    const seasonalIndex = (n + h) % season;
    return Math.round(level + (h + 1) * trend + seasonal[seasonalIndex]);
  });
  const { lower, upper } = buildBands(points, margin);

  return {
    points,
    lower,
    upper,
    method: "holt_winters",
  };
}

export function holtWintersForecast(
  series: number[],
  horizon: number,
  season = 7,
): HoltWintersForecastResult {
  if (series.length < MIN_DAYS) {
    return {
      points: [],
      lower: [],
      upper: [],
      method: "holt_winters",
      insufficientData: true,
    };
  }

  if (series.length < season * 2) {
    return levelOnlySesForecast(series, horizon);
  }

  return additiveHoltWinters(series, horizon, season);
}
