import { describe, expect, it } from "vitest";
import {
  ALL_THEMES,
  COMMUNITY_THEMES,
  DEFAULT_THEME_ID,
  findTheme,
  OFFICIAL_THEMES,
} from "./index.ts";
import { contrast, validateTheme } from "./validate.ts";

describe("theme catalog", () => {
  it.each(ALL_THEMES.map((t) => [t.id, t] as const))("%s is valid", (_id, theme) => {
    expect(validateTheme(theme)).toEqual([]);
  });

  it("has unique ids", () => {
    const ids = ALL_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lists community themes alphabetically by id", () => {
    const ids = COMMUNITY_THEMES.map((t) => t.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("has a default theme that exists and is official", () => {
    expect(OFFICIAL_THEMES.some((t) => t.id === DEFAULT_THEME_ID)).toBe(true);
    expect(findTheme(DEFAULT_THEME_ID)).toBeDefined();
  });
});

describe("validateTheme", () => {
  const base = OFFICIAL_THEMES[0];

  it("rejects bad colors, ids and low contrast", () => {
    expect(validateTheme({ ...base, id: "Bad Id" })).toContainEqual(
      expect.stringMatching(/id must be/),
    );
    expect(validateTheme({ ...base, tokens: { ...base.tokens, accent: "red" } })).toContainEqual(
      expect.stringMatching(/tokens.accent/),
    );
    expect(
      validateTheme({
        ...base,
        tokens: { ...base.tokens, text: "#eeeeee", background: "#ffffff" },
      }),
    ).toContainEqual(expect.stringMatching(/text on the page background is too low-contrast/));
  });

  it("checks links against the background, falling back to the accent", () => {
    expect(validateTheme({ ...base, tokens: { ...base.tokens, link: "#cccccc" } })).toContainEqual(
      expect.stringMatching(/links/),
    );
  });

  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});
