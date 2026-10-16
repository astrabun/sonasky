import { describe, expect, it } from "vitest";
import { googleFontFamilies, googleFontsHref, themeCss } from "../shared/themeCss.ts";
import { DEFAULT_THEME } from "../shared/themes.ts";
import { GSTATIC_PATH_RE, parseFamilies, rewriteGoogleFontsCss } from "./fonts.ts";
import { validateStyle } from "./validate/records.ts";

const UC = "https://uc.example";

describe("rewriteGoogleFontsCss", () => {
  it("points font files at Apollo's proxy", () => {
    const css = `@font-face { font-family: 'Inter'; src: url(https://fonts.gstatic.com/s/inter/v13/UcCO3Fwr.woff2) format('woff2'); }`;
    expect(rewriteGoogleFontsCss(css, UC)).toContain(
      `url(${UC}/_apollo/font/s/inter/v13/UcCO3Fwr.woff2)`,
    );
  });
  it("drops anything that would load from elsewhere", () => {
    const css = `@import url(https://evil.example/x.css); @font-face { src: url(https://evil.example/f.woff2), url("https://fonts.gstatic.com/../../x"); }`;
    const out = rewriteGoogleFontsCss(css, UC);
    expect(out).not.toContain("evil.example");
    expect(out).not.toContain("@import");
    expect(out).not.toContain("gstatic");
  });
});

describe("font request validation", () => {
  it("accepts up to two real-looking families", () => {
    expect(parseFamilies(["Inter", "Inter", "Lora"])).toEqual(["Inter", "Lora"]);
    expect(parseFamilies([])).toBeNull();
    expect(parseFamilies(["A", "B", "C"])).toBeNull();
    expect(parseFamilies(["Inter:wght@100"])).toBeNull();
  });
  it("only proxies font file paths", () => {
    expect(GSTATIC_PATH_RE.test("s/inter/v13/UcCO3Fwr.woff2")).toBe(true);
    expect(GSTATIC_PATH_RE.test("s/inter/v13/../../etc.woff2")).toBe(false);
    expect(GSTATIC_PATH_RE.test("s/inter/v13/x.svg")).toBe(false);
  });
});

describe("theme CSS with Google fonts", () => {
  const tokens = { ...DEFAULT_THEME, googleFonts: { body: "Inter", heading: "Lora" } };
  it("puts the Google font in front of the built-in stack", () => {
    const css = themeCss(tokens);
    expect(css).toContain('--apollo-font-body:"Inter", system-ui');
    expect(css).toContain('--apollo-font-heading:"Lora", system-ui');
  });
  it("ignores invalid family names from other clients", () => {
    const css = themeCss({ ...DEFAULT_THEME, googleFonts: { body: 'x";}body{' } });
    expect(css).not.toContain('x";}');
    expect(googleFontFamilies({ ...DEFAULT_THEME, googleFonts: { body: "a;b" } })).toEqual([]);
  });
  it("links Apollo's font stylesheet, never Google's", () => {
    expect(googleFontsHref(UC, googleFontFamilies(tokens))).toBe(
      `${UC}/_apollo/fonts.css?family=Inter&family=Lora`,
    );
  });
  it("validates Google fonts on write", () => {
    expect(validateStyle({ name: "t", tokens }).tokens?.googleFonts).toEqual({
      body: "Inter",
      heading: "Lora",
    });
    expect(() =>
      validateStyle({ name: "t", tokens: { ...tokens, googleFonts: { body: "Inter&x=1" } } }),
    ).toThrow(/Google Fonts/);
  });
});
