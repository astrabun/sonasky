import { describe, expect, it } from "vitest";
import { classifyLink, isTrustedHost, linkValueError } from "./links.ts";
import { hostnameToUnicode } from "./punycode.ts";
import { isSlug, slugify } from "./slug.ts";

const PUBLIC = "https://apollo.sonasky.app";

describe("classifyLink", () => {
  it.each([
    ["https://apollo.sonasky.app/@alice.bsky.social", "internal"],
    ["/@alice.bsky.social/about", "internal"],
    ["https://bsky.app/profile/alice.bsky.social", "trusted"],
    ["https://alice.bsky.social/", "trusted"],
    ["https://bsky.social", "trusted"],
    ["https://ref.sonasky.app/profile/x", "trusted"],
    ["https://sonasky.app", "trusted"],
    ["https://BSKY.APP./", "trusted"],
    ["mailto:hi@example.com", "mailto"],
  ])("%s -> %s", (href, kind) => {
    expect(classifyLink(href, PUBLIC).kind).toBe(kind);
  });

  it.each([
    "https://bsky.app.evil.com/",
    "https://evil.com/bsky.app",
    "https://evil.com/?u=https://bsky.app",
    "https://bsky.app@evil.com/",
    "https://user:pw@bsky.app/",
    "https://notbsky.app/",
    "https://evilsonasky.app/",
    "https://bsky.social.evil.com/",
    "http://bsky.app/",
    "https://xn--bsky-xxa.app/",
    "//evil.com/path",
    "https://example.com",
  ])("%s is external", (href) => {
    expect(classifyLink(href, PUBLIC).kind).toBe("external");
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "data:text/html,hi",
    "vbscript:x",
    "file:///etc/passwd",
    "http://[bad",
  ])("%s is blocked", (href) => {
    expect(classifyLink(href, PUBLIC).kind).toBe("blocked");
  });

  it("flags punycode hosts", () => {
    expect(classifyLink("https://xn--pple-43d.com/", PUBLIC).idn).toBe(true);
    expect(classifyLink("https://apple.com/", PUBLIC).idn).toBe(false);
  });

  it("treats the dev editor origin as internal", () => {
    expect(classifyLink("http://127.0.0.1:8787/@a.test", "http://127.0.0.1:8787").kind).toBe(
      "internal",
    );
    expect(classifyLink("http://localhost:8787/r/x", "http://127.0.0.1:8787").kind).toBe(
      "external",
    );
  });
});

describe("isTrustedHost", () => {
  it("does not match on suffixes without a dot boundary", () => {
    expect(isTrustedHost("xbsky.social")).toBe(false);
    expect(isTrustedHost("a.b.bsky.social")).toBe(true);
    expect(isTrustedHost("sub.bsky.app")).toBe(false);
  });
});

describe("linkValueError", () => {
  it.each([
    "https://example.com",
    "mailto:a@b.co",
    "/about",
    "about",
    "blog/hello",
    "#top",
    "media:3lbqaxyz",
  ])("accepts %s", (v) => expect(linkValueError(v)).toBeNull());
  it.each(["javascript:alert(1)", "data:text/html,x", "//evil.com", "", "../../etc", "ftp://x.y"])(
    "rejects %s",
    (v) => expect(linkValueError(v)).not.toBeNull(),
  );
  it("suggests adding https://", () => {
    expect(linkValueError("example.com")).toMatch(/https:\/\//);
  });
});

describe("hostnameToUnicode", () => {
  it("decodes punycode labels", () => {
    expect(hostnameToUnicode("xn--bcher-kva.example")).toBe("bücher.example");
    expect(hostnameToUnicode("xn--pple-43d.com")).toBe("аpple.com");
    expect(hostnameToUnicode("plain.example")).toBe("plain.example");
    expect(hostnameToUnicode("xn--!!.example")).toBe("xn--!!.example");
  });
});

describe("slugs", () => {
  it("slugifies titles", () => {
    expect(slugify("My Cool Page!")).toBe("my-cool-page");
    expect(slugify("Café Événement")).toBe("cafe-evenement");
    expect(slugify("!!!")).toBe("page");
  });
  it("validates slugs", () => {
    expect(isSlug("about")).toBe(true);
    expect(isSlug("a".repeat(65))).toBe(false);
    expect(isSlug("-about")).toBe(false);
    expect(isSlug("About")).toBe(false);
    expect(isSlug("self")).toBe(true);
  });
});
