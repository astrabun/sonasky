import { describe, expect, it, vi } from "vitest";
import { COMMUNITY_UPGRADES } from "../shared/communityUpgrades.ts";
import type { CommunityBlock } from "../shared/records.ts";
import { renderBlocks, type BlockContext } from "./render/blocks.ts";
import { usercontentCsp } from "./render/csp.ts";
import { communityBlockCss, communityBlockScripts } from "./render/document.ts";
import { validatePage, ValidationError } from "./validate/records.ts";

// The real catalog, plus a test block with link, picture and markdown fields
// (the shipped examples don't cover every field type).
vi.mock("@sonasky/apollo-blocks", async (importActual) => {
  const actual = await importActual<typeof import("@sonasky/apollo-blocks")>();
  const testBlock = actual.defineCommunityBlock({
    id: "test-card",
    name: "Test card",
    description: "For tests.",
    author: { name: "Tests" },
    fields: {
      title: { type: "text", label: "Title", required: true },
      link: { type: "url", label: "Link" },
      photo: { type: "media", label: "Photo" },
      body: { type: "markdown", label: "Body" },
      pics: { type: "mediaList", label: "Pictures" },
    },
    example: { title: "Hi" },
    css: ".t { color: red }",
    script: "block.dataset.ready = '1';",
    render: (f, h) => {
      const href = h.href(f.link);
      const src = h.mediaUrl(f.photo?.media);
      return `<h3 class="t">${h.esc(f.title)}</h3>${href ? `<a href="${h.esc(href)}">go</a>` : ""}${
        src ? `<img src="${h.esc(src)}" alt="${h.esc(f.photo?.alt)}">` : ""
      }${h.html("body")}<script>alert(1)</script>`;
    },
  });
  return {
    ...actual,
    findCommunityBlock: (id: string | undefined) =>
      id === testBlock.id ? testBlock : actual.findCommunityBlock(id),
  };
});

const D = "app.sonasky.apollo.defs";
const page = (block: Record<string, unknown>) =>
  validatePage({ title: "t", format: "blocks", blocks: [{ $type: `${D}#community`, ...block }] });

describe("community block validation", () => {
  it("accepts a known block, tidying its fields", () => {
    expect(
      page({ block: "test-card", fields: { title: "Hi", link: " https://example.com ", junk: 1 } })
        .blocks?.[0],
    ).toEqual({
      $type: `${D}#community`,
      block: "test-card",
      fields: { title: "Hi", link: "https://example.com", pics: [] },
    });
  });

  it("rejects unknown blocks", () => {
    expect(() => page({ block: "nope", fields: {} })).toThrow(/Unknown community block/);
  });

  it("points at the bad field", () => {
    try {
      page({ block: "test-card", fields: {} });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).field).toBe("blocks[0].fields.title");
    }
  });

  it("checks links and pictures like the built-in blocks", () => {
    expect(() =>
      page({ block: "test-card", fields: { title: "Hi", link: "javascript:alert(1)" } }),
    ).toThrow(ValidationError);
    expect(() =>
      page({ block: "test-card", fields: { title: "Hi", photo: { media: "../x", alt: "a" } } }),
    ).toThrow(/Pick an uploaded image/);
    expect(() =>
      page({ block: "test-card", fields: { title: "Hi", photo: { media: "3l2abc", alt: "" } } }),
    ).toThrow(/description/);
    expect(() =>
      page({
        block: "test-card",
        fields: {
          title: "Hi",
          pics: [
            { media: "3l2abc", alt: "a" },
            { media: "../x", alt: "b" },
          ],
        },
      }),
    ).toThrow(/Pick an uploaded image/);
  });
});

describe("community block rendering", () => {
  const sanitized: string[] = [];
  const ctx: BlockContext = {
    did: "did:plc:abcdefghijklmnopqrstuvwx",
    pageUrls: [],
    mediaUrl: (rkey) => `https://u.example/m/${rkey}`,
    rewriteHref: (href) => (href.startsWith("https:") ? href : null),
    // Stand-in for the HTMLRewriter sanitizer (not available under Node).
    sanitize: async (html) => {
      sanitized.push(html);
      return html.replace(/<script>.*?<\/script>/g, "");
    },
    badges: new Map(),
    urlsFor: () => ({ mediaUrl: () => null, rewriteHref: () => null }),
  };

  it("wraps the block in its class and sanitizes its output", async () => {
    const block: CommunityBlock = {
      $type: `${D}#community`,
      block: "test-card",
      fields: {
        title: "<Hi>",
        link: "https://example.com",
        photo: { media: "3l2abc", alt: "A cat" },
        body: "**bold**",
      },
    };
    const html = await renderBlocks([block], ctx);
    expect(html).toMatch(/^<div class="apollo-cb apollo-cb-test-card">/);
    expect(html).toContain("&lt;Hi&gt;");
    expect(html).toContain(`<a href="https://example.com">go</a>`);
    expect(html).toContain(`<img src="https://u.example/m/3l2abc" alt="A cat">`);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("<script>");
    expect(sanitized.some((s) => s.includes("<script>"))).toBe(true);
  });

  it("skips blocks that aren't in the catalog", async () => {
    expect(await renderBlocks([{ $type: `${D}#community`, block: "gone", fields: {} }], ctx)).toBe(
      "",
    );
  });

  it("adds each used block's scoped CSS once", () => {
    const b = (block: string): CommunityBlock => ({ $type: `${D}#community`, block, fields: {} });
    expect(communityBlockCss([b("test-card"), b("test-card"), b("gone")])).toEqual([
      ".apollo-cb-test-card{.t { color: red }}",
    ]);
  });
});

describe("community block scripts", () => {
  const b = (block: string): CommunityBlock => ({ $type: `${D}#community`, block, fields: {} });

  it("links each used block's script once, from Apollo's own origin, versioned", () => {
    const tags = communityBlockScripts(
      [b("test-card"), b("test-card"), b("gone")],
      "https://u.example",
    );
    expect(tags.match(/<script /g)).toHaveLength(1);
    expect(tags).toMatch(
      /^<script src="https:\/\/u\.example\/_apollo\/block\/test-card\.js\?v=[0-9a-z]+"><\/script>$/,
    );
  });

  it("leaves out blocks without a script", () => {
    expect(communityBlockScripts([b("pull-quote")], "https://u.example")).toBe("");
  });

  it("allows block scripts in the page CSP", () => {
    expect(usercontentCsp("https://u.example", "https://p.example", "did:plc:x")).toMatch(
      /script-src [^;]*https:\/\/u\.example\/_apollo\/block\//,
    );
  });
});

describe("graduated community blocks", () => {
  it("has an upgrade for every graduated id, and nothing else", async () => {
    const { GRADUATED_BLOCKS } = await import("@sonasky/apollo-blocks");
    expect(Object.keys(COMMUNITY_UPGRADES).sort()).toEqual(Object.keys(GRADUATED_BLOCKS).sort());
  });
});
