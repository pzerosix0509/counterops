import { afterEach, describe, expect, it, vi } from "vitest";
import { searchWeb } from "@/lib/ai/web-search";

const originalKey = process.env.TAVILY_API_KEY;
const originalBase = process.env.TAVILY_BASE_URL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = originalKey;
  if (originalBase === undefined) delete process.env.TAVILY_BASE_URL;
  else process.env.TAVILY_BASE_URL = originalBase;
});

describe("searchWeb", () => {
  it("returns [] when no API key is configured", async () => {
    delete process.env.TAVILY_API_KEY;
    const results = await searchWeb("giá vàng hôm nay");
    expect(results).toEqual([]);
  });

  it("returns parsed results on success", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: "Giá vàng", url: "https://example.com/gold", content: "Giá vàng hôm nay 80 triệu." },
          { title: "", url: "", content: "" },
        ],
      }),
    }));
    const results = await searchWeb("giá vàng hôm nay", 5);
    expect(results).toEqual([
      { title: "Giá vàng", url: "https://example.com/gold", content: "Giá vàng hôm nay 80 triệu." },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns [] on non-ok response", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const results = await searchWeb("thời tiết", 3);
    expect(results).toEqual([]);
  });

  it("returns [] when fetch throws", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const results = await searchWeb("thời tiết", 3);
    expect(results).toEqual([]);
  });
});
