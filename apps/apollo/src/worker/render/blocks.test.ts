import { describe, expect, it } from "vitest";
import { formatEventTime } from "./blocks.ts";

describe("formatEventTime", () => {
  it("formats in the event's time zone with a zone name", () => {
    expect(formatEventTime("2026-10-24T23:00:00.000Z", "America/New_York")).toBe(
      "Saturday, October 24, 2026 at 7:00 PM EDT",
    );
  });
  it("falls back to UTC for unknown zones instead of throwing", () => {
    expect(formatEventTime("2026-10-24T23:00:00.000Z", "Not/AZone")).toBe(
      "Saturday, October 24, 2026 at 11:00 PM UTC",
    );
  });
  it("works without a zone and rejects bad dates", () => {
    expect(formatEventTime("2026-10-24T23:00:00.000Z", undefined)).toMatch(/2026/);
    expect(formatEventTime("not a date", "UTC")).toBeNull();
  });
});
