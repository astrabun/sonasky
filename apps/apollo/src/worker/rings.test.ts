import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderSiteDocument } from "./render/document.ts";
import { membershipRkey, neighbor, randomMember, ringUri } from "./rings.ts";
import { parseRingUri, validateRing, ValidationError } from "./validate/records.ts";

const A = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
const B = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const C = "did:plc:cccccccccccccccccccccccc";
const roster = [{ did: A }, { did: B }, { did: C }];

describe("neighbor", () => {
  it("walks the ring and wraps both ways", () => {
    expect(neighbor(roster, A, "next")?.did).toBe(B);
    expect(neighbor(roster, C, "next")?.did).toBe(A);
    expect(neighbor(roster, A, "prev")?.did).toBe(C);
    expect(neighbor(roster, B, "prev")?.did).toBe(A);
  });
  it("returns the only member for a ring of one, and null for outsiders", () => {
    expect(neighbor([{ did: A }], A, "next")?.did).toBe(A);
    expect(neighbor(roster, "did:plc:zzzzzzzzzzzzzzzzzzzzzzzz", "next")).toBeNull();
    expect(neighbor(roster, undefined, "prev")).toBeNull();
  });
});

describe("randomMember", () => {
  it("avoids the current site when it can", () => {
    for (let i = 0; i < 20; i++) expect(randomMember(roster, A)?.did).not.toBe(A);
    expect(randomMember([{ did: A }], A)?.did).toBe(A);
    expect(randomMember([], A)).toBeNull();
  });
});

describe("membershipRkey", () => {
  it("is stable, distinct per ring and a valid rkey", async () => {
    const one = await membershipRkey(ringUri(A, "cool-ring"));
    expect(one).toBe(await membershipRkey(ringUri(A, "cool-ring")));
    expect(one).not.toBe(await membershipRkey(ringUri(A, "other")));
    expect(one).toMatch(/^[a-z2-7]{26}$/);
  });
});

describe("validateRing", () => {
  const base = { name: "Cool ring", members: [{ did: A }, { did: B }] };
  it("drops unknown keys and fills defaults", () => {
    const ring = validateRing({ ...base, evil: 1, members: [{ did: A, evil: 2 }] });
    expect(ring.$type).toBe("app.sonasky.apollo.ring");
    expect(ring.format).toBe("markdown");
    expect("evil" in ring).toBe(false);
    expect(Object.keys(ring.members[0]).sort()).toEqual(["addedAt", "did"]);
  });
  it("rejects bad and duplicate members", () => {
    expect(() => validateRing({ ...base, members: [{ did: "alice" }] })).toThrow(ValidationError);
    expect(() => validateRing({ ...base, members: [{ did: A }, { did: A }] })).toThrow(
      ValidationError,
    );
    expect(() =>
      validateRing({ ...base, members: Array.from({ length: 101 }, () => ({ did: A })) }),
    ).toThrow(ValidationError);
  });
  it("keeps unlisted only when it is exactly true", () => {
    expect(validateRing({ ...base, unlisted: true }).unlisted).toBe(true);
    expect("unlisted" in validateRing({ ...base, unlisted: false })).toBe(false);
    expect("unlisted" in validateRing({ ...base, unlisted: "yes" })).toBe(false);
  });
});

describe("parseRingUri", () => {
  it("accepts only ring records", () => {
    expect(parseRingUri(ringUri(A, "cool-ring"))).toEqual({ did: A, slug: "cool-ring" });
    expect(parseRingUri(`at://${A}/app.sonasky.apollo.page/home`)).toBeNull();
    expect(parseRingUri(`at://${A}/app.sonasky.apollo.ring/Not_A_Slug`)).toBeNull();
  });
});

describe("ring nav in rendered sites", () => {
  // Sanitizing isn't under test here; Node has no HTMLRewriter, so pass HTML through.
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
  const rings = [
    {
      name: "<b>Ring</b>",
      indexUrl: "https://apollo.test/@owner/ring/r",
      prevUrl: "https://apollo.test/@owner/ring/r/prev?from=x",
      nextUrl: "https://apollo.test/@owner/ring/r/next?from=x",
    },
  ];
  const input = {
    did: A,
    actor: "alice.test",
    site: {
      $type: "app.sonasky.apollo" as const,
      title: "Site",
      homePage: "home",
      createdAt: "",
      updatedAt: "",
    },
    target: {
      kind: "page" as const,
      slug: "home",
      record: {
        $type: "app.sonasky.apollo.page" as const,
        title: "Home",
        format: "markdown" as const,
        body: "hi",
        createdAt: "",
        updatedAt: "",
      },
    },
    styles: [],
    scripts: [],
    rings,
  };

  it("shows in the default footer, escaped", async () => {
    const html = await renderSiteDocument(input, origins);
    expect(html).toMatch(/SonaSky Apollo<\/a><nav class="apollo-ring"/);
    expect(html).toContain("&lt;b&gt;Ring&lt;/b&gt;");
    expect(html).toContain('href="https://apollo.test/@owner/ring/r/next?from=x"');
  });

  it("is appended even when a custom layout has no footer", async () => {
    const html = await renderSiteDocument(
      {
        ...input,
        layout: {
          $type: "app.sonasky.apollo.layout",
          name: "Bare",
          html: "<main>{{content}}</main>",
          createdAt: "",
          updatedAt: "",
        },
      },
      origins,
    );
    expect(html).toContain(
      '<footer class="apollo-footer apollo-ring-footer"><nav class="apollo-ring"',
    );
  });
});
