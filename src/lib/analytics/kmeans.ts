export const KMEANS_FEATURE_NAMES = [
  "recency_days",
  "frequency",
  "monetary",
  "avg_order_value",
  "avg_order_interval",
  "weekend_ratio",
  "dinner_ratio",
  "age",
] as const;

export type KMeansFeatureName = (typeof KMEANS_FEATURE_NAMES)[number];

export interface KMeansFeatureRow {
  recency_days: number;
  frequency: number;
  monetary: number;
  avg_order_value: number;
  avg_order_interval: number;
  weekend_ratio: number;
  dinner_ratio: number;
  age?: number | null;
  favorite_category?: string | null;
}

export interface ChooseKAndFitResult {
  k: number;
  labels: number[];
  centroids: number[][];
  silhouette: number;
  featureNames: string[];
  insufficient_data?: boolean;
}

export interface ChooseKAndFitOptions {
  seed?: number;
}

type Rng = () => number;

function createRng(seed = 42): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function euclideanSquared(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

export function standardize(matrix: number[][]): number[][] {
  if (matrix.length === 0) return [];
  const cols = matrix[0].length;
  const means = Array.from({ length: cols }, () => 0);
  const stds = Array.from({ length: cols }, () => 0);

  for (const row of matrix) {
    for (let j = 0; j < cols; j++) {
      means[j] += row[j];
    }
  }
  for (let j = 0; j < cols; j++) {
    means[j] /= matrix.length;
  }

  for (const row of matrix) {
    for (let j = 0; j < cols; j++) {
      const d = row[j] - means[j];
      stds[j] += d * d;
    }
  }
  const divisor = matrix.length > 1 ? matrix.length - 1 : 1;
  for (let j = 0; j < cols; j++) {
    stds[j] = Math.sqrt(stds[j] / divisor) || 1;
  }

  return matrix.map((row) =>
    row.map((value, j) => (value - means[j]) / stds[j]),
  );
}

function rowsToMatrix(rows: KMeansFeatureRow[]): number[][] {
  const ages = rows
    .map((row) => row.age)
    .filter((age): age is number => age != null && !Number.isNaN(age));
  const ageMean = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;

  return rows.map((row) => [
    Number(row.recency_days),
    Number(row.frequency),
    Number(row.monetary),
    Number(row.avg_order_value),
    Number(row.avg_order_interval),
    Number(row.weekend_ratio),
    Number(row.dinner_ratio),
    row.age == null || Number.isNaN(row.age) ? ageMean : Number(row.age),
  ]);
}

function assignLabels(data: number[][], centroids: number[][]): number[] {
  return data.map((point) => {
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < centroids.length; c++) {
      const dist = euclideanSquared(point, centroids[c]);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    return best;
  });
}

function recomputeCentroids(
  data: number[][],
  labels: number[],
  k: number,
  rng: Rng,
): number[][] {
  const dims = data[0].length;
  const centroids: number[][] = Array.from({ length: k }, () => Array(dims).fill(0));
  const counts = Array(k).fill(0);

  for (let i = 0; i < data.length; i++) {
    const label = labels[i];
    counts[label]++;
    for (let j = 0; j < dims; j++) {
      centroids[label][j] += data[i][j];
    }
  }

  for (let c = 0; c < k; c++) {
    if (counts[c] === 0) {
      const idx = Math.floor(rng() * data.length);
      centroids[c] = [...data[idx]];
      continue;
    }
    for (let j = 0; j < dims; j++) {
      centroids[c][j] /= counts[c];
    }
  }

  return centroids;
}

function kMeansPlusPlusInit(data: number[][], k: number, rng: Rng): number[][] {
  const centroids: number[][] = [];
  const first = Math.floor(rng() * data.length);
  centroids.push([...data[first]]);

  while (centroids.length < k) {
    const distances = data.map((point) => {
      let minDist = Infinity;
      for (const centroid of centroids) {
        minDist = Math.min(minDist, euclideanSquared(point, centroid));
      }
      return minDist;
    });
    const total = distances.reduce((a, b) => a + b, 0);
    let pick = rng() * total;
    let chosen = 0;
    for (let i = 0; i < distances.length; i++) {
      pick -= distances[i];
      if (pick <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push([...data[chosen]]);
  }

  return centroids;
}

function fitKMeans(
  data: number[][],
  k: number,
  rng: Rng,
  maxIter = 50,
): { labels: number[]; centroids: number[][] } {
  let centroids = kMeansPlusPlusInit(data, k, rng);
  let labels = assignLabels(data, centroids);

  for (let iter = 0; iter < maxIter; iter++) {
    const nextCentroids = recomputeCentroids(data, labels, k, rng);
    const nextLabels = assignLabels(data, nextCentroids);
    const stable =
      nextLabels.every((label, i) => label === labels[i]) &&
      nextCentroids.every((centroid, c) =>
        centroid.every((value, j) => value === centroids[c][j]),
      );
    centroids = nextCentroids;
    labels = nextLabels;
    if (stable) break;
  }

  return { labels, centroids };
}

export function silhouetteForClustering(data: number[][], labels: number[]): number {
  const n = data.length;
  if (n < 2) return 0;

  const clusterSizes = new Map<number, number>();
  for (const label of labels) {
    clusterSizes.set(label, (clusterSizes.get(label) ?? 0) + 1);
  }
  if (clusterSizes.size < 2) return 0;

  let total = 0;

  for (let i = 0; i < n; i++) {
    const own = labels[i];
    const ownSize = clusterSizes.get(own) ?? 0;
    if (ownSize <= 1) {
      total += 0;
      continue;
    }

    let intra = 0;
    let intraCount = 0;
    for (let j = 0; j < n; j++) {
      if (i === j || labels[j] !== own) continue;
      intra += euclidean(data[i], data[j]);
      intraCount++;
    }
    const a = intraCount > 0 ? intra / intraCount : 0;

    let b = Infinity;
    for (const [cluster, size] of clusterSizes) {
      if (cluster === own || size === 0) continue;
      let inter = 0;
      for (let j = 0; j < n; j++) {
        if (labels[j] !== cluster) continue;
        inter += euclidean(data[i], data[j]);
      }
      b = Math.min(b, inter / size);
    }

    if (!Number.isFinite(b)) {
      total += 0;
      continue;
    }

    const denom = Math.max(a, b);
    const s = denom === 0 ? 0 : (b - a) / denom;
    total += s;
  }

  return total / n;
}

export function chooseKAndFit(
  rows: KMeansFeatureRow[],
  kMin = 2,
  kMax = 8,
  options: ChooseKAndFitOptions = {},
): ChooseKAndFitResult {
  const featureNames = [...KMEANS_FEATURE_NAMES];

  if (rows.length < 6) {
    return {
      insufficient_data: true,
      k: 0,
      labels: [],
      centroids: [],
      silhouette: 0,
      featureNames,
    };
  }

  const rng = createRng(options.seed ?? 42);
  const scaled = standardize(rowsToMatrix(rows));
  const upperK = Math.min(kMax, rows.length - 1);
  const lowerK = Math.min(kMin, upperK);

  let bestK = lowerK;
  let bestLabels: number[] = [];
  let bestCentroids: number[][] = [];
  let bestSilhouette = -Infinity;

  for (let k = lowerK; k <= upperK; k++) {
    const { labels, centroids } = fitKMeans(scaled, k, rng);
    const silhouette = silhouetteForClustering(scaled, labels);
    if (silhouette > bestSilhouette) {
      bestSilhouette = silhouette;
      bestK = k;
      bestLabels = labels;
      bestCentroids = centroids;
    }
  }

  return {
    k: bestK,
    labels: bestLabels,
    centroids: bestCentroids,
    silhouette: bestSilhouette,
    featureNames,
  };
}
