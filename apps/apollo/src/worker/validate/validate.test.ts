import { describe, expect, it } from "vitest";
import { LIMITS } from "../../shared/limits.ts";
import { urlRewriters } from "../render/document.ts";
import { sniffMime } from "./media.ts";
import { validatePage, validateSite, validateStyle, ValidationError } from "./records.ts";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );

describe("sniffMime", () => {
  it("recognizes allowed formats", () => {
    expect(sniffMime(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMime(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(bytes("GIF89a"))).toBe("image/gif");
    expect(sniffMime(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("image/webp");
    expect(sniffMime(bytes([0, 0, 0, 0x20], "ftypavif"))).toBe("image/avif");
    expect(sniffMime(bytes([0, 0, 0, 0x20], "ftypisom"))).toBe("video/mp4");
    expect(sniffMime(bytes([0x1a, 0x45, 0xdf, 0xa3], "....webm"))).toBe("video/webm");
  });
  it("rejects everything else", () => {
    expect(sniffMime(bytes("<svg xmlns="))).toBeNull();
    expect(sniffMime(bytes("<!doctype html>"))).toBeNull();
    expect(sniffMime(bytes("MZ\x90\x00"))).toBeNull(); // Windows executable
    expect(sniffMime(bytes("PK\x03\x04"))).toBeNull(); // zip
    expect(sniffMime(bytes("%PDF-1.7"))).toBeNull();
    expect(sniffMime(bytes([0, 0, 0, 0x20], "ftypheic"))).toBeNull();
    expect(sniffMime(bytes([0x1a, 0x45, 0xdf, 0xa3], "matroska"))).toBeNull();
  });
});

const baseSite = { title: "My site", homePage: "home" };

describe("validateSite", () => {
  it("drops unknown keys and stamps timestamps", () => {
    const site = validateSite({ ...baseSite, evil: "<script>", $type: "x" });
    expect(site.$type).toBe("app.sonasky.apollo");
    expect("evil" in site).toBe(false);
    expect(site.updatedAt).toBeTruthy();
  });
  it("rejects javascript: nav links", () => {
    expect(() =>
      validateSite({ ...baseSite, nav: [{ label: "x", url: "javascript:alert(1)" }] }),
    ).toThrow(ValidationError);
  });
  it("rejects unknown self-labels", () => {
    expect(() => validateSite({ ...baseSite, labels: { values: [{ val: "!takedown" }] } })).toThrow(
      ValidationError,
    );
  });
  it("requires a home page", () => {
    expect(() => validateSite({ title: "x" })).toThrow(/home page/);
  });
});

describe("validatePage", () => {
  it("caps body size", () => {
    expect(() =>
      validatePage({ title: "t", format: "markdown", body: "a".repeat(LIMITS.pageBodyBytes + 1) }),
    ).toThrow(/Too long/);
  });
  it("caps block count", () => {
    const blocks = Array.from({ length: LIMITS.blocksPerPage + 1 }, () => ({
      $type: "app.sonasky.apollo.defs#divider",
    }));
    expect(() => validatePage({ title: "t", format: "blocks", blocks })).toThrow(/Too many/);
  });
  it("rejects unknown block types and bad button links", () => {
    expect(() =>
      validatePage({
        title: "t",
        format: "blocks",
        blocks: [{ $type: "app.sonasky.apollo.defs#iframe" }],
      }),
    ).toThrow(/Unknown block/);
    expect(() =>
      validatePage({
        title: "t",
        format: "blocks",
        blocks: [
          {
            $type: "app.sonasky.apollo.defs#buttons",
            items: [{ label: "x", url: "data:text/html,x" }],
          },
        ],
      }),
    ).toThrow(ValidationError);
  });
  it("only accepts Bluesky post URIs for post blocks", () => {
    expect(() =>
      validatePage({
        title: "t",
        format: "blocks",
        blocks: [
          {
            $type: "app.sonasky.apollo.defs#bskyPost",
            uri: "at://did:plc:abc/app.sonasky.apollo.page/x",
          },
        ],
      }),
    ).toThrow(ValidationError);
  });
  it("requires alt text on images", () => {
    expect(() =>
      validatePage({
        title: "t",
        format: "blocks",
        blocks: [{ $type: "app.sonasky.apollo.defs#image", media: "3l2abc", alt: "" }],
      }),
    ).toThrow(/description/);
  });
});

describe("labels block", () => {
  const LABELER = "did:plc:2qawvcwumvgxmed6iy6pmt6l";
  const page = (block: Record<string, unknown>) =>
    validatePage({
      title: "t",
      format: "blocks",
      blocks: [{ $type: "app.sonasky.apollo.defs#labels", ...block }],
    });

  it("keeps labelers in order, dedupes them and defaults the layout", () => {
    const other = "did:web:labeler.example.com";
    expect(page({ labelers: [other, LABELER, other] }).blocks?.[0]).toEqual({
      $type: "app.sonasky.apollo.defs#labels",
      labelers: [other, LABELER],
      layout: "grouped",
      title: undefined,
    });
  });
  it("allows no labelers", () => {
    expect(page({ labelers: [] }).blocks?.[0]).toMatchObject({ labelers: [] });
  });
  it("rejects handles, junk and too many labelers", () => {
    expect(() => page({ labelers: ["sonasky.app"] })).toThrow(/labeler/);
    expect(() => page({ labelers: [42] })).toThrow(ValidationError);
    const many = Array.from({ length: LIMITS.labelersPerBlock + 1 }, () => LABELER);
    expect(() => page({ labelers: many })).toThrow(/Too many/);
  });
  it("rejects unknown layouts", () => {
    expect(() => page({ labelers: [LABELER], layout: "carousel" })).toThrow(ValidationError);
  });
});

describe("image block alt text", () => {
  it("accepts an image uploaded with an explicit opt-out", () => {
    const page = validatePage({
      title: "t",
      format: "blocks",
      blocks: [{ $type: "app.sonasky.apollo.defs#image", media: "3l2abc", alt: "", noAlt: true }],
    });
    expect(page.blocks?.[0]).toMatchObject({ alt: "", noAlt: true });
  });
});

describe("gallery alt text", () => {
  const gallery = (items: unknown[]) =>
    validatePage({
      title: "t",
      format: "blocks",
      blocks: [{ $type: "app.sonasky.apollo.defs#gallery", items }],
    }).blocks?.[0];

  it("requires alt text unless the author explicitly opts out", () => {
    expect(() => gallery([{ media: "3l2abc", alt: "" }])).toThrow(/description/);
    expect(() => gallery([{ media: "3l2abc", alt: "", noAlt: "yes" }])).toThrow(ValidationError);
  });
  it("accepts an explicit opt-out", () => {
    expect(gallery([{ media: "3l2abc", noAlt: true }])).toEqual({
      $type: "app.sonasky.apollo.defs#gallery",
      items: [{ media: "3l2abc", alt: "", noAlt: true }],
    });
  });
  it("keeps a description over the opt-out", () => {
    expect(gallery([{ media: "3l2abc", alt: "A fox", noAlt: true }])).toEqual({
      $type: "app.sonasky.apollo.defs#gallery",
      items: [{ media: "3l2abc", alt: "A fox" }],
    });
  });
});

describe("validateStyle", () => {
  const tokens = {
    background: "#ffffff",
    surface: "#ffffff",
    text: "#000000",
    muted: "#333333",
    accent: "#0000ff",
    accentText: "#ffffff",
    fontBody: "sans",
    fontHeading: "serif",
    radius: "small",
    width: "narrow",
  };
  it("only accepts hex colors and known options", () => {
    expect(validateStyle({ name: "t", tokens }).tokens?.accent).toBe("#0000ff");
    expect(() =>
      validateStyle({ name: "t", tokens: { ...tokens, accent: "red;}</style>" } }),
    ).toThrow();
    expect(() => validateStyle({ name: "t", tokens: { ...tokens, fontBody: "url(x)" } })).toThrow();
  });
  it("accepts an optional link color and a basedOn theme id", () => {
    const style = validateStyle({
      name: "t",
      tokens: { ...tokens, link: "#ABCDEF" },
      basedOn: "sky-dim",
    });
    expect(style.tokens?.link).toBe("#abcdef");
    expect(style.basedOn).toBe("sky-dim");
    expect(validateStyle({ name: "t", tokens }).tokens).not.toHaveProperty("link");
    expect(() => validateStyle({ name: "t", tokens: { ...tokens, link: "blue" } })).toThrow();
    expect(() => validateStyle({ name: "t", tokens, basedOn: "../x" })).toThrow(/theme/);
  });
});

describe("urlRewriters", () => {
  const did = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
  const urls = urlRewriters(
    { publicOrigin: "https://apollo.sonasky.app", usercontentOrigin: "https://uc.example" },
    did,
    "alice.bsky.social",
    "home",
  );
  it("turns relative links into viewer URLs", () => {
    expect(urls.rewriteHref("/about")).toBe("https://apollo.sonasky.app/@alice.bsky.social/about");
    expect(urls.rewriteHref("./blog/hello")).toBe(
      "https://apollo.sonasky.app/@alice.bsky.social/blog/hello",
    );
    expect(urls.rewriteHref("/home")).toBe("https://apollo.sonasky.app/@alice.bsky.social");
    expect(urls.rewriteHref("#top")).toBe("#top");
  });
  it("drops dangerous hrefs", () => {
    expect(urls.rewriteHref("javascript:alert(1)")).toBeNull();
    expect(urls.rewriteHref("data:text/html,x")).toBeNull();
    expect(urls.rewriteHref("../../x")).toBeNull();
  });
  it("only allows own media, data images and the Bluesky CDN as sources", () => {
    expect(urls.rewriteSrc("media:3l2abc")).toBe(`https://uc.example/m/${did}/3l2abc`);
    expect(urls.rewriteSrc("https://cdn.bsky.app/img/x")).toBe("https://cdn.bsky.app/img/x");
    expect(urls.rewriteSrc("https://tracker.example/pixel.gif")).toBeNull();
    expect(urls.rewriteSrc("https://uc.example/m/did:plc:other/x")).toBeNull();
    expect(urls.rewriteSrc("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(urls.rewriteSrc("data:image/png;base64,iVBORw0KGgo=")).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
  });
});
