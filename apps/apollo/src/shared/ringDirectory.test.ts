import { describe, expect, it } from "vitest";
import type { DirectoryRing } from "./dto.ts";
import { isRingSort, pickRandomRing, scoreRing, searchRings, sortRings } from "./ringDirectory.ts";

const NOW = Date.parse("2026-10-17T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function ring(name: string, over: Partial<DirectoryRing> = {}): DirectoryRing {
  return {
    uri: `at://did:plc:owner/app.sonasky.apollo.ring/${name.toLowerCase().replace(/\W+/g, "-")}`,
    name,
    url: `https://apollo.test/@owner/ring/${name}`,
    ownerDid: "did:plc:owner",
    ownerHandle: "owner.test",
    activeMembers: 3,
    createdAt: daysAgo(100),
    updatedAt: daysAgo(10),
    ...over,
  };
}

const names = (rings: DirectoryRing[]) => rings.map((r) => r.name);

describe("scoreRing", () => {
  it("grows with members and fades with age, but never to zero", () => {
    const fresh = ring("a", { activeMembers: 4, updatedAt: daysAgo(0) });
    const stale = ring("b", { activeMembers: 4, updatedAt: daysAgo(365) });
    const big = ring("c", { activeMembers: 8, updatedAt: daysAgo(0) });
    expect(scoreRing(fresh, NOW)).toBeGreaterThan(scoreRing(stale, NOW));
    expect(scoreRing(big, NOW)).toBeGreaterThan(scoreRing(fresh, NOW));
    expect(scoreRing(stale, NOW)).toBeGreaterThan(0);
  });
  it("lets a big established ring beat a brand-new ring of one", () => {
    const established = ring("old", { activeMembers: 20, updatedAt: daysAgo(200) });
    const tiny = ring("new", { activeMembers: 1, updatedAt: daysAgo(0) });
    expect(scoreRing(established, NOW)).toBeGreaterThan(scoreRing(tiny, NOW));
  });
});

describe("sortRings", () => {
  const rings = [
    ring("Bravo", { activeMembers: 2, createdAt: daysAgo(5), updatedAt: daysAgo(1) }),
    ring("alpha", { activeMembers: 9, createdAt: daysAgo(50), updatedAt: daysAgo(300) }),
    ring("Charlie", { activeMembers: 5, createdAt: daysAgo(20), updatedAt: daysAgo(3) }),
  ];
  it("orders by each mode", () => {
    expect(names(sortRings(rings, "members", NOW))).toEqual(["alpha", "Charlie", "Bravo"]);
    expect(names(sortRings(rings, "updated", NOW))).toEqual(["Bravo", "Charlie", "alpha"]);
    expect(names(sortRings(rings, "newest", NOW))).toEqual(["Bravo", "Charlie", "alpha"]);
    expect(names(sortRings(rings, "name", NOW))).toEqual(["alpha", "Bravo", "Charlie"]);
    expect(names(sortRings(rings, "recommended", NOW))[0]).toBe("Charlie");
  });
  it("doesn't mutate its input", () => {
    const before = names(rings);
    sortRings(rings, "name", NOW);
    expect(names(rings)).toEqual(before);
  });
  it("recognises sort keys", () => {
    expect(isRingSort("members")).toBe(true);
    expect(isRingSort("toString")).toBe(false);
    expect(isRingSort(undefined)).toBe(false);
  });
});

describe("searchRings", () => {
  const rings = [
    ring("Pixel Art Ring", { description: "Sprites and tiles" }),
    ring("Café Crawl", { description: "Coffee people" }),
    ring("Retro Games", { description: "Pixel-perfect platformers", ownerHandle: "arcade.test" }),
  ];
  it("needs every word to match somewhere", () => {
    expect(names(searchRings(rings, "pixel sprites", "name", NOW))).toEqual(["Pixel Art Ring"]);
    expect(searchRings(rings, "pixel nope", "name", NOW)).toEqual([]);
  });
  it("ignores case and accents", () => {
    expect(names(searchRings(rings, "CAFE", "name", NOW))).toEqual(["Café Crawl"]);
  });
  it("ranks name matches over handle and description matches", () => {
    expect(names(searchRings(rings, "pixel", "name", NOW))).toEqual([
      "Pixel Art Ring",
      "Retro Games",
    ]);
    expect(names(searchRings(rings, "arcade", "name", NOW))).toEqual(["Retro Games"]);
  });
  it("is just a sort when the query is blank", () => {
    expect(names(searchRings(rings, "   ", "name", NOW))).toEqual(names(sortRings(rings, "name")));
  });
});

describe("pickRandomRing", () => {
  it("avoids the current ring when it can", () => {
    const rings = [ring("a"), ring("b"), ring("c")];
    for (let i = 0; i < 20; i++) expect(pickRandomRing(rings, rings[0].uri)?.name).not.toBe("a");
    expect(pickRandomRing([rings[0]], rings[0].uri)?.name).toBe("a");
    expect(pickRandomRing([])).toBeNull();
  });
});
