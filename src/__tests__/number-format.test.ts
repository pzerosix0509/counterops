import { describe, expect, it } from "vitest";
import { formatNumberInput, parseFormattedNumber } from "@/lib/utils/format";

describe("formatNumberInput", () => {
  it("formats integers with vi-VN thousand separators", () => {
    expect(formatNumberInput("0")).toBe("0");
    expect(formatNumberInput("1234")).toBe("1.234");
    expect(formatNumberInput("1234567")).toBe("1.234.567");
  });

  it("handles decimals with comma separator", () => {
    expect(formatNumberInput("1,5")).toBe("1,5");
    expect(formatNumberInput("1234,56")).toBe("1.234,56");
  });

  it("strips existing thousand separators before reformatting", () => {
    expect(formatNumberInput("1.234")).toBe("1.234");
    expect(formatNumberInput("1.234.567")).toBe("1.234.567");
  });

  it("returns empty string for empty/whitespace input", () => {
    expect(formatNumberInput("")).toBe("");
    expect(formatNumberInput("   ")).toBe("");
  });

  it("returns the raw string for non-numeric input", () => {
    expect(formatNumberInput("abc")).toBe("abc");
  });

  it("formats a trailing comma as the start of decimals", () => {
    expect(formatNumberInput("4,")).toBe("4");
  });
});

describe("parseFormattedNumber", () => {
  it("parses integers", () => {
    expect(parseFormattedNumber("1234")).toBe(1234);
    expect(parseFormattedNumber("0")).toBe(0);
  });

  it("parses vi-VN formatted numbers", () => {
    expect(parseFormattedNumber("1.234")).toBe(1234);
    expect(parseFormattedNumber("1.234.567")).toBe(1234567);
    expect(parseFormattedNumber("1.234,56")).toBe(1234.56);
    expect(parseFormattedNumber("1,5")).toBe(1.5);
  });

  it("returns null for empty input", () => {
    expect(parseFormattedNumber("")).toBeNull();
    expect(parseFormattedNumber("  ")).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(parseFormattedNumber("abc")).toBeNull();
  });
});
