import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanWebSearchQuery, searchWeb } from "@/lib/ai/web-search";
import { isWebSearchQuestion } from "@/lib/ai/semantic-layer";

const originalKey = process.env.TAVILY_API_KEY;
const originalBase = process.env.TAVILY_BASE_URL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = originalKey;
  if (originalBase === undefined) delete process.env.TAVILY_BASE_URL;
  else process.env.TAVILY_BASE_URL = originalBase;
});

describe("cleanWebSearchQuery", () => {
  it("removes command prefixes and filler words", () => {
    expect(cleanWebSearchQuery("web search giá cà phê hiện nay trên thị trường")).toBe("giá cà phê hiện nay trên thị trường");
    expect(cleanWebSearchQuery("tìm kiếm web: giá vàng hôm nay")).toBe("giá vàng hôm nay");
    expect(cleanWebSearchQuery("tìm trên mạng giá cà phê robusta")).toBe("giá cà phê robusta");
    expect(cleanWebSearchQuery("hãy cho tôi biết thời tiết hôm nay")).toBe("thời tiết hôm nay");
    expect(cleanWebSearchQuery("giá cà phê")).toBe("giá cà phê");
  });
});

describe("isWebSearchQuestion", () => {
  it("detects commodity and market price queries as web search", () => {
    expect(isWebSearchQuestion("giá cà phê hiện nay trên thị trường như thế nào?")).toBe(true);
    expect(isWebSearchQuestion("giá cà phê Robusta hôm nay bao nhiêu?")).toBe(true);
    expect(isWebSearchQuestion("giá vàng hôm nay bao nhiêu?")).toBe(true);
    expect(isWebSearchQuestion("tỷ giá USD hôm nay thế nào?")).toBe(true);
    expect(isWebSearchQuestion("giá xăng dầu hiện nay")).toBe(true);
  });

  it("detects weather, F&B trends, and competitors as web search", () => {
    expect(isWebSearchQuestion("thời tiết ngày mai thế nào?")).toBe(true);
    expect(isWebSearchQuestion("xu hướng đồ uống hot trend 2026")).toBe(true);
    expect(isWebSearchQuestion("Highlands Coffee đang có chương trình gì?")).toBe(true);
    expect(isWebSearchQuestion("tin tức mới nhất hôm nay")).toBe(true);
  });

  it("does not classify internal store analytics as web search", () => {
    expect(isWebSearchQuestion("Doanh thu hôm nay là bao nhiêu?")).toBe(false);
    expect(isWebSearchQuestion("Giá vốn món cà phê sữa tuần rồi")).toBe(false);
    expect(isWebSearchQuestion("Món nào bán chạy nhất tháng này?")).toBe(false);
    expect(isWebSearchQuestion("Có mặt hàng tồn kho nào sắp hết không?")).toBe(false);
  });
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
