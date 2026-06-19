import { describe, it, expect } from "vitest";
import { getPresetRange, parseDateRangeSearchParams, startOfDay, endOfDay, formatVND } from "@/lib/date/ranges";

describe("date ranges", () => {
  it("computes today range", () => {
    const now = new Date(2026, 5, 19, 8, 0, 0);
    const r = getPresetRange("today", now);
    expect(r.from).toEqual(startOfDay(now));
    expect(r.to).toEqual(endOfDay(now));
  });

  it("computes last7 range as 7-day window", () => {
    const now = new Date(2026, 5, 19, 8, 0, 0);
    const r = getPresetRange("last7", now);
    expect(r.from.getDate()).toBe(13);
    expect(r.from.getHours()).toBe(0);
    expect(r.to.getDate()).toBe(19);
    expect(r.to.getHours()).toBe(23);
  });

  it("parses custom range from search params", () => {
    const params = new URLSearchParams("range=custom&from=2026-06-01&to=2026-06-07");
    const r = parseDateRangeSearchParams(params);
    expect(r.from.getFullYear()).toBe(2026);
    expect(r.from.getMonth()).toBe(5);
    expect(r.from.getDate()).toBe(1);
    expect(r.to.getFullYear()).toBe(2026);
    expect(r.to.getMonth()).toBe(5);
    expect(r.to.getDate()).toBe(7);
  });

  it("formats VND amounts", () => {
    expect(formatVND(1234567)).toBe("1.234.567 đ");
  });
});