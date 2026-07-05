const EMBEDDING_DIMENSIONS = 1536;

type EmbeddingKind = "document" | "query";
type EmbeddingProvider = "openai-compatible" | "google";

type EmbeddingConfig =
  | {
      provider: "openai-compatible";
      apiKey: string;
      baseUrl: string;
      model: string;
    }
  | {
      provider: "google";
      apiKey: string;
      baseUrl: string;
      model: string;
      dimensions: number;
    };

export function vectorToSql(vector: number[]): string {
  return `[${vector.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

function getEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env.AI_EMBEDDING_PROVIDER?.toLowerCase();
  if (provider === "google" || provider === "gemini") return "google";
  if (provider === "openai" || provider === "openai-compatible") return "openai-compatible";

  const model = process.env.AI_EMBEDDING_MODEL ?? "";
  const hasGoogleKey = Boolean(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY);
  if (model.startsWith("gemini-embedding") || hasGoogleKey) return "google";

  return "openai-compatible";
}

function getEmbeddingConfig(): EmbeddingConfig | null {
  const provider = getEmbeddingProvider();

  if (provider === "google") {
    const apiKey =
      process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.AI_EMBEDDING_API_KEY;
    if (!apiKey) return null;

    return {
      provider,
      apiKey,
      baseUrl: (process.env.GOOGLE_AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(
        /\/$/,
        "",
      ),
      model: process.env.AI_EMBEDDING_MODEL || "gemini-embedding-2",
      dimensions: Number(process.env.AI_EMBEDDING_DIMENSIONS || EMBEDDING_DIMENSIONS),
    };
  }

  const apiKey = process.env.AI_EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  return {
    provider,
    apiKey,
    baseUrl: (process.env.AI_EMBEDDING_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small",
  };
}

function formatGeminiText(text: string, kind: EmbeddingKind) {
  if (kind === "query") return `task: question answering | query: ${text}`;
  return `title: none | text: ${text}`;
}

async function embedTextsWithGoogle(
  texts: string[],
  config: Extract<EmbeddingConfig, { provider: "google" }>,
  kind: EmbeddingKind,
) {
  if (config.dimensions !== EMBEDDING_DIMENSIONS) return null;

  const modelName = config.model.startsWith("models/") ? config.model : `models/${config.model}`;
  const response = await fetch(`${config.baseUrl}/${modelName}:batchEmbedContents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey,
    },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: modelName,
        content: {
          parts: [{ text: formatGeminiText(text, kind) }],
        },
        output_dimensionality: config.dimensions,
      })),
    }),
  });

  if (!response.ok) return null;

  const payload = await response.json();
  const vectors = (payload?.embeddings ?? [])
    .map((embedding: any) => embedding?.values)
    .filter((value: unknown) => Array.isArray(value)) as number[][];

  if (vectors.length !== texts.length) return null;
  if (vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) return null;
  return { model: config.model, vectors };
}

async function embedTextsWithOpenAICompatible(
  texts: string[],
  config: Extract<EmbeddingConfig, { provider: "openai-compatible" }>,
) {
  const body: Record<string, unknown> = {
    model: config.model,
    input: texts,
  };

  if (config.model.startsWith("text-embedding-3")) {
    body.dimensions = EMBEDDING_DIMENSIONS;
  }

  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;

  const payload = await response.json();
  const vectors = (payload?.data ?? [])
    .sort((a: any, b: any) => Number(a.index ?? 0) - Number(b.index ?? 0))
    .map((item: any) => item.embedding)
    .filter((value: unknown) => Array.isArray(value)) as number[][];

  if (vectors.length !== texts.length) return null;
  if (vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) return null;
  return { model: config.model, vectors };
}

export async function embedTexts(
  texts: string[],
  kind: EmbeddingKind = "document",
): Promise<{ model: string; vectors: number[][] } | null> {
  const config = getEmbeddingConfig();
  if (!config || texts.length === 0) return null;

  const batches: string[][] = [];
  for (let index = 0; index < texts.length; index += 64) {
    batches.push(texts.slice(index, index + 64));
  }

  const vectors: number[][] = [];
  for (const batch of batches) {
    const result = config.provider === "google"
      ? await embedTextsWithGoogle(batch, config, kind)
      : await embedTextsWithOpenAICompatible(batch, config);
    if (!result) return null;
    vectors.push(...result.vectors);
  }
  return { model: config.model, vectors };
}

export async function embedText(
  text: string,
  kind: EmbeddingKind = "query",
): Promise<{ model: string; vector: number[] } | null> {
  const result = await embedTexts([text], kind);
  if (!result) return null;
  return { model: result.model, vector: result.vectors[0] };
}
