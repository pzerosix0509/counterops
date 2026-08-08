export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  results?: Array<{ title?: string; url?: string; content?: string }>;
}

const TAVILY_TIMEOUT_MS = 6_000;
const TAVILY_MAX_RESULTS = 10;

export async function searchWeb(query: string, limit = 5): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  const baseUrl = (process.env.TAVILY_BASE_URL || "https://api.tavily.com/search").replace(/\/$/, "");
  const maxResults = Math.min(Math.max(Number(limit) || 5, 1), TAVILY_MAX_RESULTS);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);
  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as TavilyResponse;
    return (payload.results ?? [])
      .map((result) => ({
        title: String(result.title ?? "").slice(0, 300),
        url: String(result.url ?? "").slice(0, 500),
        content: String(result.content ?? "").slice(0, 2_000),
      }))
      .filter((result) => result.title || result.content);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
