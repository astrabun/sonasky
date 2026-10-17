import { describe, expect, it } from "vitest";
import { PRESET_LABELERS } from "../../shared/labelers.ts";
import { accountLabelValues, labelDisplayName, type LabelerLabels } from "../labels.ts";
import { labelsHtml } from "./labels.ts";

const SONASKY = PRESET_LABELERS[0].did;
const OTHER = "did:web:labeler.example.com";
const ME = "did:plc:abcdefghijklmnopqrstuvwx";

const groups: LabelerLabels[] = [
  {
    labeler: {
      did: SONASKY,
      name: "SonaSky",
      avatar: "https://cdn.bsky.app/img/avatar/plain/x/y@jpeg",
      names: { wolf: "Wolf", fox: "Fox" },
    },
    values: ["wolf", "fox"],
  },
  { labeler: { did: OTHER, name: "<Other>", names: {} }, values: ["cool-person"] },
  { labeler: { did: "did:web:empty.example.com", name: "Empty", names: {} }, values: [] },
];

describe("labelsHtml", () => {
  it("groups by labeler, sorted by name, skipping labelers with nothing to show", () => {
    const html = labelsHtml({ labelers: [], layout: "grouped", title: "My labels" }, groups);
    expect(html).toContain(`<h3 class="apollo-labels-title">My labels</h3>`);
    expect(html.match(/apollo-labels-group/g)).toHaveLength(2);
    expect(html.indexOf(">Fox<")).toBeLessThan(html.indexOf(">Wolf<"));
    expect(html).toContain(`href="https://sonasky.app/?id=fox"`);
    // Other labelers' chips aren't links, and names are escaped.
    expect(html).toContain(`<span class="apollo-label-chip">cool-person</span>`);
    expect(html).toContain("&lt;Other&gt;");
    expect(html).not.toContain("Empty");
  });
  it("puts every chip in one list when combined", () => {
    const html = labelsHtml({ labelers: [], layout: "combined" }, groups);
    expect(html).not.toContain("apollo-labels-group");
    expect(html.match(/<ul/g)).toHaveLength(1);
    expect(html.match(/<li>/g)).toHaveLength(3);
  });
  it("renders nothing when there are no labels", () => {
    expect(labelsHtml({ labelers: [] }, [groups[2]])).toBe("");
  });
});

describe("accountLabelValues", () => {
  const row = (val: string, extra: Record<string, unknown> = {}) => ({
    src: SONASKY,
    uri: ME,
    val,
    cts: "2026-01-01T00:00:00.000Z",
    ...extra,
  });
  it("applies negations and expiry and ignores other sources, records and ! labels", () => {
    const values = accountLabelValues(
      [
        row("wolf"),
        row("fox"),
        row("fox", { neg: true, cts: "2026-02-01T00:00:00.000Z" }),
        row("cat", { exp: "2020-01-01T00:00:00.000Z" }),
        row("dog", { src: OTHER }),
        row("bird", { uri: `at://${ME}/app.bsky.actor.profile/self` }),
        row("!hide"),
      ],
      ME,
      SONASKY,
    );
    expect(values).toEqual(["wolf"]);
  });
  it("normalizes legacy spellings before replaying negations", () => {
    const values = accountLabelValues(
      [row("red_fox"), row("Wolf"), row("wolf", { neg: true, cts: "2026-02-01T00:00:00.000Z" })],
      ME,
      SONASKY,
    );
    expect(values).toEqual(["red-fox"]);
  });
});

describe("labelDisplayName", () => {
  it("prefers English, then any locale, then the raw value", () => {
    expect(
      labelDisplayName("x", [
        { lang: "pt-BR", name: "Lobo" },
        { lang: "en", name: "Wolf" },
      ]),
    ).toBe("Wolf");
    expect(labelDisplayName("x", [{ lang: "pt-BR", name: "Lobo" }])).toBe("Lobo");
    expect(labelDisplayName("x", undefined)).toBe("x");
  });
});
