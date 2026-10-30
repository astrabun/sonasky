import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defaultBadgeSource, normalizeBadgeSource } from "../shared/badges.ts";
import { LIMITS } from "../shared/limits.ts";
import { badgeUris, badgeMediaDids, loadBadges, type LoadedBadge } from "./badges.ts";
import type { AppEnv } from "./env.ts";
import { usercontentCsp } from "./render/csp.ts";
import { renderSiteDocument } from "./render/document.ts";
import { validateBadge, validatePage, ValidationError } from "./validate/records.ts";

const resolveActor = vi.hoisted(() => vi.fn());
const getPublicRecord = vi.hoisted(() => vi.fn());
const checkModeration = vi.hoisted(() => vi.fn());
const isBlocked = vi.hoisted(() => vi.fn());
vi.mock("./atproto/identity.ts", () => ({ resolveActor }));
vi.mock("./atproto/repo.ts", () => ({ getPublicRecord }));
vi.mock("./moderation.ts", () => ({ checkModeration, isBlocked }));

const OWNER = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
const FRIEND = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const LABELLED = "did:plc:cccccccccccccccccccccccc";
const uri = (did: string, rkey: string) => `at://${did}/app.sonasky.apollo.badge/${rkey}`;
const env = {} as AppEnv;

describe("validateBadge", () => {
  const base = { media: "3mabc", alt: "My site" };

  it("keeps known fields and normalizes the design", () => {
    const b = validateBadge({
      ...base,
      href: "https://example.com",
      evil: 1,
      source: defaultBadgeSource(),
    });
    expect(b.$type).toBe("app.sonasky.apollo.badge");
    expect("evil" in b).toBe(false);
    expect(b.source?.texts[0].text).toBe("MY SITE");
  });
  it("accepts a page of the owner's site as the link", () => {
    expect(validateBadge({ ...base, href: "about" }).href).toBe("about");
  });
  it("rejects links that don't mean the same thing on other sites", () => {
    expect(() => validateBadge({ ...base, href: "#top" })).toThrow(ValidationError);
    expect(() => validateBadge({ ...base, href: "media:3mabc" })).toThrow(ValidationError);
    expect(() => validateBadge({ ...base, href: "javascript:alert(1)" })).toThrow(ValidationError);
  });
  it("needs a description unless explicitly skipped", () => {
    expect(() => validateBadge({ media: "3mabc" })).toThrow(/Describe the badge/);
    expect(validateBadge({ media: "3mabc", noAlt: true })).toMatchObject({ alt: "", noAlt: true });
  });
  it("rejects a design that isn't one", () => {
    expect(() => validateBadge({ ...base, source: { background: "red" } })).toThrow(/design/);
  });
});

describe("normalizeBadgeSource", () => {
  it("clamps numbers, drops bad colors and extra text lines", () => {
    const s = normalizeBadgeSource({
      background: { from: "#FFFFFF", to: "red" },
      border: "wobbly",
      texts: [
        { text: "a", color: "#000000", x: 9999, y: -9999, font: "comic" },
        { text: "b" },
        { text: "c" },
      ],
    });
    expect(s?.background).toEqual({ from: "#ffffff" });
    expect(s?.border).toBe("none");
    expect(s?.texts).toHaveLength(2);
    expect(s?.texts[0]).toMatchObject({ x: 176, y: -31, font: "pixel" });
  });
  it("keeps a picture's focus in 0-100 and drops the centered default", () => {
    const image = (focus: object) =>
      normalizeBadgeSource({ background: { from: "#000000" }, image: { media: "3mabc", ...focus } })
        ?.image;
    expect(image({ focusY: 0, focusX: 250 })).toMatchObject({ focusY: 0, focusX: 100 });
    expect(image({ focusY: 50 })).not.toHaveProperty("focusY");
  });
});

describe("badges block validation", () => {
  const page = (items: unknown[]) =>
    validatePage({
      title: "t",
      format: "blocks",
      blocks: [{ $type: "app.sonasky.apollo.defs#badges", items, scale: 2 }],
    });

  it("dedupes uris and keeps scale", () => {
    const record = page([{ uri: uri(FRIEND, "3maaa") }, { uri: uri(FRIEND, "3maaa") }]);
    expect(record.blocks?.[0]).toEqual({
      $type: "app.sonasky.apollo.defs#badges",
      items: [{ uri: uri(FRIEND, "3maaa") }],
      scale: 2,
    });
  });
  it("rejects uris of other record types", () => {
    expect(() => page([{ uri: `at://${FRIEND}/app.bsky.feed.post/3maaa` }])).toThrow(/88x31/);
  });
  it("caps the number of badges", () => {
    const items = Array.from({ length: LIMITS.badgesPerBlock + 1 }, (_, i) => ({
      uri: uri(FRIEND, `3m${i}`),
    }));
    expect(() => page(items)).toThrow(/Too many/);
  });
});

describe("loadBadges", () => {
  afterEach(() => vi.resetAllMocks());

  it("loads own and others' badges, skipping blocked, labelled and missing ones", async () => {
    resolveActor.mockImplementation(async (did: string) => ({
      did,
      pds: `https://pds.test/${did}`,
    }));
    isBlocked.mockResolvedValue(false);
    checkModeration.mockImplementation(async (_env: AppEnv, did: string) =>
      did === LABELLED ? { kind: "warn", labels: ["porn"] } : { kind: "ok" },
    );
    getPublicRecord.mockImplementation(
      async (_pds: string, did: string, _c: string, rkey: string) =>
        rkey === "gone"
          ? null
          : { value: { media: `m-${rkey}`, alt: `alt ${did}`, href: "about" } },
    );

    const uris = [uri(OWNER, "1"), uri(FRIEND, "2"), uri(LABELLED, "3"), uri(FRIEND, "gone")];
    const badges = await loadBadges(env, OWNER, uris);

    expect([...badges.keys()]).toEqual([uri(OWNER, "1"), uri(FRIEND, "2")]);
    expect(badges.get(uri(FRIEND, "2"))).toEqual({
      did: FRIEND,
      media: "m-2",
      alt: `alt ${FRIEND}`,
      href: "about",
    });
    // The owner was checked before rendering; only other accounts are.
    expect(checkModeration).not.toHaveBeenCalledWith(env, OWNER, expect.anything());
    expect(badgeMediaDids(badges, OWNER)).toEqual([FRIEND]);
  });

  it("does nothing without uris", async () => {
    expect((await loadBadges(env, OWNER, [])).size).toBe(0);
    expect(resolveActor).not.toHaveBeenCalled();
  });
});

describe("badges in rendered sites", () => {
  beforeAll(() => {
    class PassThrough {
      on() {
        return this;
      }
      onDocument() {
        return this;
      }
      transform(res: Response) {
        return res;
      }
    }
    vi.stubGlobal("HTMLRewriter", PassThrough);
  });
  afterAll(() => vi.unstubAllGlobals());

  const origins = { publicOrigin: "https://apollo.test", usercontentOrigin: "https://uc.test" };
  const items = [uri(OWNER, "1"), uri(FRIEND, "2"), uri(FRIEND, "missing")].map((u) => ({
    uri: u,
  }));
  const target = {
    kind: "page" as const,
    slug: "home",
    record: {
      $type: "app.sonasky.apollo.page" as const,
      title: "Home",
      format: "blocks" as const,
      blocks: [{ $type: "app.sonasky.apollo.defs#badges" as const, items, scale: 2 as const }],
      createdAt: "",
      updatedAt: "",
    },
  };
  const badges = new Map<string, LoadedBadge>([
    [uri(OWNER, "1"), { did: OWNER, media: "m1", alt: "Mine", href: "about" }],
    [uri(FRIEND, "2"), { did: FRIEND, media: "m2", alt: '<b>"Friend"</b>', href: "about" }],
  ]);
  const input = {
    did: OWNER,
    actor: "alice.test",
    site: {
      $type: "app.sonasky.apollo" as const,
      title: "Site",
      homePage: "home",
      createdAt: "",
      updatedAt: "",
    },
    target,
    styles: [],
    scripts: [],
    badges,
  };

  it("collects the uris to load", () => {
    expect(badgeUris(target)).toEqual(items.map((i) => i.uri));
    expect(badgeUris({ kind: "blog", posts: [] })).toEqual([]);
  });

  it("resolves links and images against each badge's own site", async () => {
    const html = await renderSiteDocument(input, origins);
    expect(html).toContain('<a href="https://apollo.test/@alice.test/about" title="Mine">');
    expect(html).toContain(
      `<img src="https://uc.test/m/${OWNER}/m1" alt="Mine" width="176" height="62"`,
    );
    expect(html).toContain(`<a href="https://apollo.test/@${FRIEND}/about"`);
    expect(html).toContain(`src="https://uc.test/m/${FRIEND}/m2"`);
    expect(html).toContain("&lt;b&gt;&quot;Friend&quot;&lt;/b&gt;");
    expect(html).not.toContain("missing");
  });

  it("lets the page load other accounts' badge images, and nothing else of theirs", () => {
    const csp = usercontentCsp("https://uc.test", "https://apollo.test", OWNER, [FRIEND]);
    expect(csp).toContain(`img-src https://uc.test/m/${OWNER}/ https://uc.test/m/${FRIEND}/ data:`);
    expect(csp).toContain(`media-src https://uc.test/m/${OWNER}/;`);
  });
});
