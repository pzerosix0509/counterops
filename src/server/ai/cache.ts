import "server-only";

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

interface AiRuntimeCacheState {
  entries: Map<string, CacheEntry<unknown>>;
}

const CACHE_STATE_KEY = Symbol.for("counterops.ai.runtime-cache");
const MAX_CACHE_ENTRIES = 250;
const DEFAULT_TIME_BUCKET_MS = 5 * 60_000;

function cacheState(): AiRuntimeCacheState {
  const globalState = globalThis as typeof globalThis & {
    [CACHE_STATE_KEY]?: AiRuntimeCacheState;
  };
  if (!globalState[CACHE_STATE_KEY]) {
    globalState[CACHE_STATE_KEY] = { entries: new Map() };
  }
  return globalState[CACHE_STATE_KEY];
}

function stableValue(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([nestedKey, nested]) => [nestedKey, stableValue(nested, nestedKey)]),
    );
  }
  if (
    typeof value === "string"
    && (key === "from" || key === "to" || key === "p_from" || key === "p_to")
  ) {
    const timestamp = Date.parse(value);
    const configuredBucket = Number(process.env.AI_RPC_CACHE_BUCKET_MS);
    const bucketMs = Number.isFinite(configuredBucket) && configuredBucket > 0
      ? configuredBucket
      : DEFAULT_TIME_BUCKET_MS;
    if (Number.isFinite(timestamp)) {
      return new Date(Math.floor(timestamp / bucketMs) * bucketMs).toISOString();
    }
  }
  return value;
}

export function aiToolCacheKey(parts: {
  organizationId: string;
  branchId: string;
  tool: string;
  arguments: Record<string, unknown>;
}) {
  return JSON.stringify(stableValue(parts));
}

export async function withAiToolCache<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = Number(process.env.AI_RPC_CACHE_TTL_MS ?? 45_000),
): Promise<{ value: T; hit: boolean }> {
  const state = cacheState();
  const now = Date.now();
  const cached = state.entries.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) {
    state.entries.delete(key);
    state.entries.set(key, cached);
    return { value: cached.value, hit: true };
  }
  if (cached) state.entries.delete(key);

  const value = await loader();
  if (ttlMs > 0) {
    state.entries.set(key, { value, expiresAt: now + ttlMs });
    while (state.entries.size > MAX_CACHE_ENTRIES) {
      const oldestKey = state.entries.keys().next().value;
      if (typeof oldestKey !== "string") break;
      state.entries.delete(oldestKey);
    }
  }
  return { value, hit: false };
}

export function clearAiToolCache() {
  cacheState().entries.clear();
}
