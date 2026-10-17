import { describe, expect, it } from "vitest";
import { themeDefinitionSource, themeIdFromName, themeVariableName } from "./export.ts";
import { ALL_THEMES, OFFICIAL_THEMES } from "./index.ts";
import type { ThemeDefinition } from "./types.ts";
import { isGoogleFontFamily, validateTheme } from "./validate.ts";

/** Evaluate generated source back into an object (strip the TS-only parts). */
function evaluate(source: string): ThemeDefinition {
  const body = source
    .replace(/^import type .*$/m, "")
    .replace(/export const \w+: ThemeDefinition = /, "return ");
  return new Function(body)() as ThemeDefinition;
}

describe("themeDefinitionSource", () => {
  it.each(ALL_THEMES.map((t) => [t.id, t] as const))("round-trips %s", (_id, theme) => {
    const source = themeDefinitionSource(theme);
    expect(source).toContain(`export const ${themeVariableName(theme.id)}: ThemeDefinition = {`);
    expect(evaluate(source)).toEqual(theme);
  });

  it("includes Google fonts and escapes strings", () => {
    const theme: ThemeDefinition = {
      ...OFFICIAL_THEMES[0],
      id: "quote-test",
      name: 'Say "hi"',
      author: { name: "A \\ B", handle: "a.bsky.social" },
      tokens: { ...OFFICIAL_THEMES[0].tokens, googleFonts: { body: "Inter", heading: "Lora" } },
    };
    const back = evaluate(themeDefinitionSource(theme));
    expect(back).toEqual(theme);
    expect(validateTheme(back)).toEqual([]);
  });
});

describe("ids and names", () => {
  it("makes ids from names", () => {
    expect(themeIdFromName("Lavender Fields!")).toBe("lavender-fields");
    expect(themeIdFromName("Café Noir")).toBe("cafe-noir");
    expect(themeIdFromName("???")).toBe("my-theme");
  });
  it("makes variable names from ids", () => {
    expect(themeVariableName("lavender-fields")).toBe("lavenderFields");
    expect(themeVariableName("8-bit")).toBe("theme8Bit");
  });
});

describe("Google font names", () => {
  it.each(["Inter", "Source Serif 4", "Atkinson Hyperlegible", "M PLUS Rounded 1c"])(
    "accepts %s",
    (name) => expect(isGoogleFontFamily(name)).toBe(true),
  );
  it.each(["", " Inter", "Inter  Tight", "Inter;}", "Inter&family=Evil", "a".repeat(65), 'x"y'])(
    "rejects %s",
    (name) => expect(isGoogleFontFamily(name)).toBe(false),
  );
});
