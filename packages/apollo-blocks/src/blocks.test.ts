import { describe, expect, it } from "vitest";
import { cssProblems, scopedCss } from "./css.ts";
import { normalizeFields } from "./fields.ts";
import { COMMUNITY_BLOCKS, findCommunityBlock, GRADUATED_BLOCKS } from "./index.ts";
import { defineCommunityBlock } from "./types.ts";
import { testHelpers, validateBlockDefinition } from "./validate.ts";

describe("community block catalog", () => {
  it.each(COMMUNITY_BLOCKS.map((b) => [b.id, b] as const))("%s is valid", (_id, block) => {
    expect(validateBlockDefinition(block)).toEqual([]);
  });

  it("has unique ids", () => {
    const ids = COMMUNITY_BLOCKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lists community blocks alphabetically by id", () => {
    const ids = COMMUNITY_BLOCKS.map((b) => b.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("never reuses a graduated block's id", () => {
    for (const id of Object.keys(GRADUATED_BLOCKS)) expect(findCommunityBlock(id)).toBeUndefined();
  });
});

const sample = defineCommunityBlock({
  id: "sample",
  name: "Sample",
  description: "For tests.",
  author: { name: "Tests" },
  fields: {
    title: { type: "text", label: "Title", required: true, max: 10 },
    when: { type: "datetime", label: "When" },
    size: {
      type: "select",
      label: "Size",
      options: [
        { value: "s", label: "Small" },
        { value: "l", label: "Large" },
      ],
      default: "s",
    },
    count: { type: "number", label: "Count", default: 1, min: 0, max: 5 },
    shown: { type: "boolean", label: "Shown" },
    photo: { type: "media", label: "Photo" },
  },
  example: { title: "Hi" },
  render: (f, h) => `<p>${h.esc(f.title)}</p>`,
});

describe("normalizeFields", () => {
  it("fills defaults, drops unknown keys and empty optional fields", () => {
    expect(normalizeFields(sample, { title: "Hi", extra: 1, when: "" })).toEqual({
      ok: true,
      fields: { title: "Hi", size: "s", count: 1, shown: false },
    });
  });

  it("explains every bad value, with its field", () => {
    const result = normalizeFields(sample, {
      title: "much too long",
      when: "not a date",
      size: "xl",
      count: 9,
      shown: "yes",
      photo: { media: "3l2abc" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.path)).toEqual([
      "title",
      "when",
      "size",
      "count",
      "shown",
      "photo.alt",
    ]);
  });

  it("requires required fields and accepts pictures marked as undescribed", () => {
    expect(normalizeFields(sample, {})).toMatchObject({
      ok: false,
      errors: [{ path: "title", message: "This is required." }],
    });
    expect(
      normalizeFields(sample, { title: "Hi", photo: { media: "3l2abc", alt: "", noAlt: true } }),
    ).toMatchObject({ ok: true, fields: { photo: { media: "3l2abc", alt: "", noAlt: true } } });
  });

  it("normalizes dates to ISO", () => {
    expect(
      normalizeFields(sample, { title: "Hi", when: "2026-10-24T19:00:00-04:00" }),
    ).toMatchObject({ ok: true, fields: { when: "2026-10-24T23:00:00.000Z" } });
  });
});

describe("validateBlockDefinition", () => {
  it("accepts the test block", () => {
    expect(validateBlockDefinition(sample)).toEqual([]);
  });

  it("rejects bad ids, field keys and examples", () => {
    expect(validateBlockDefinition({ ...sample, id: "Bad Id" })).toContainEqual(
      expect.stringMatching(/id must be/),
    );
    expect(
      validateBlockDefinition({
        ...sample,
        fields: { "bad-key": { type: "text", label: "x" } },
        example: {},
      }),
    ).toContainEqual(expect.stringMatching(/field "bad-key" must be a camelCase/));
    expect(validateBlockDefinition({ ...sample, example: {} })).toContainEqual(
      expect.stringMatching(/example.title: This is required/),
    );
  });

  it("reports a render that throws", () => {
    expect(
      validateBlockDefinition({
        ...sample,
        render: () => {
          throw new Error("boom");
        },
      }),
    ).toContainEqual(expect.stringMatching(/render threw.*boom/));
  });

  it("renders the catalog with escaping helpers", () => {
    expect(
      sample.render({ title: "<b>", size: "s", count: 1, shown: false } as never, testHelpers()),
    ).toBe("<p>&lt;b&gt;</p>");
  });
});

describe("block CSS", () => {
  it("allows plain nested rules and the allowed at-rules", () => {
    expect(
      cssProblems(
        `& { color: var(--apollo-text) } .a::before { content: "}" } @media (min-width: 600px) { .a { margin: 0 } }`,
      ),
    ).toEqual([]);
  });

  it("refuses anything that loads or escapes the block", () => {
    expect(cssProblems(".a { background: url(https://x.example/a.png) }")).toContainEqual(
      expect.stringMatching(/url\(\)/),
    );
    expect(cssProblems(`@import "x.css";`)).toContainEqual(expect.stringMatching(/@import/));
    expect(cssProblems("@font-face { font-family: x }")).toContainEqual(
      expect.stringMatching(/@font-face/),
    );
    expect(cssProblems("} body { display: none }")).toContainEqual(
      expect.stringMatching(/unbalanced/),
    );
    expect(cssProblems(".a { color: red }</style>")).toContainEqual(expect.stringMatching(/<\//));
    expect(cssProblems(".a { position : fixed }")).toContainEqual(
      expect.stringMatching(/position: fixed/),
    );
    expect(cssProblems(`.a { content: "oops }`)).toContainEqual(expect.stringMatching(/unclosed/));
  });

  it("scopes CSS under the block's class", () => {
    expect(scopedCss({ ...sample, css: ".a{color:red}" })).toBe(".apollo-cb-sample{.a{color:red}}");
    expect(scopedCss(sample)).toBe("");
  });
});
