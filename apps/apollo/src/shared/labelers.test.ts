import { describe, expect, it } from "vitest";
import {
  labelsPlaceholder,
  parseLabelerList,
  PRESET_LABELERS,
  sonaskyLabelUrl,
} from "./labelers.ts";
import { LIMITS } from "./limits.ts";

const [SONASKY, POKEMON] = PRESET_LABELERS.map((p) => p.did);
const OTHER = "did:plc:ar7c4by46qjdydhdevvrndac";

describe("parseLabelerList", () => {
  it("maps aliases and keeps DIDs in order", () => {
    expect(parseLabelerList(`pokemon ${OTHER} SonaSky`)).toEqual([POKEMON, OTHER, SONASKY]);
  });
  it("drops junk and duplicates", () => {
    expect(parseLabelerList(" sonasky, nope sonasky did:plc:short javascript:x ")).toEqual([
      SONASKY,
    ]);
    expect(parseLabelerList("")).toEqual([]);
  });
  it("caps the list", () => {
    const dids = Array.from(
      { length: LIMITS.labelersPerBlock + 5 },
      (_, i) => `did:web:l${i}.example.com`,
    );
    expect(parseLabelerList(dids.join(" "))).toHaveLength(LIMITS.labelersPerBlock);
  });
});

describe("labelsPlaceholder", () => {
  it("writes aliases for presets and round-trips through the parser", () => {
    const html = labelsPlaceholder({ labelers: [SONASKY, OTHER], layout: "combined" });
    expect(html).toBe(`<div data-apollo-labels="sonasky ${OTHER}" data-layout="combined"></div>`);
    const attr = /data-apollo-labels="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(parseLabelerList(attr)).toEqual([SONASKY, OTHER]);
  });
  it("escapes the title and leaves out the default layout", () => {
    expect(labelsPlaceholder({ labelers: [POKEMON], layout: "grouped", title: `"<a>` })).toBe(
      `<div data-apollo-labels="pokemon" data-title="&quot;&lt;a>"></div>`,
    );
  });
});

describe("sonaskyLabelUrl", () => {
  it("links SonaSky labels only", () => {
    expect(sonaskyLabelUrl(POKEMON, "pikachu")).toBe("https://sonasky.app/?id=pikachu");
    expect(sonaskyLabelUrl(OTHER, "pikachu")).toBeNull();
  });
});
