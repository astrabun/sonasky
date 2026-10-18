import { describe, expect, it } from "vitest";
import type { DirectorySite } from "./dto.ts";
import { isSiteSort, paginate, sortSites } from "./siteDirectory.ts";

const NOW = Date.parse("2026-10-17T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function site(title: string, over: Partial<DirectorySite> = {}): DirectorySite {
  return {
    did: `did:plc:${title.toLowerCase()}`,
    url: `https://apollo.test/@${title}`,
    title,
    createdAt: daysAgo(100),
    updatedAt: daysAgo(10),
    likes: 0,
    ...over,
  };
}

const titles = (sites: DirectorySite[]) => sites.map((s) => s.title);

describe("sortSites", () => {
  const a = site("A", { likes: 2, createdAt: daysAgo(30), updatedAt: daysAgo(1) });
  const b = site("B", { likes: 5, createdAt: daysAgo(90), updatedAt: daysAgo(20) });
  const c = site("C", {
    likes: 2,
    createdAt: daysAgo(5),
    updatedAt: daysAgo(5),
    lastLinkedAt: daysAgo(2),
  });
  const d = site("D", { createdAt: daysAgo(60), updatedAt: daysAgo(3), lastLinkedAt: daysAgo(40) });
  const all = [a, b, c, d];

  it("ranks by likes, then most recently updated", () => {
    expect(titles(sortSites(all, "likes"))).toEqual(["B", "A", "C", "D"]);
  });

  it("orders by creation either way", () => {
    expect(titles(sortSites(all, "newest"))).toEqual(["C", "A", "D", "B"]);
    expect(titles(sortSites(all, "oldest"))).toEqual(["B", "D", "A", "C"]);
  });

  it("orders by last update", () => {
    expect(titles(sortSites(all, "updated"))).toEqual(["A", "D", "C", "B"]);
  });

  it("puts recently linked sites first and never-linked ones last", () => {
    expect(titles(sortSites(all, "linked"))).toEqual(["C", "D", "A", "B"]);
  });

  it("doesn't mutate its input", () => {
    sortSites(all, "oldest");
    expect(titles(all)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 45 }, (_, i) => i);

  it("slices 1-based pages", () => {
    expect(paginate(items, 1)).toMatchObject({ page: 1, pages: 3 });
    expect(paginate(items, 3).items).toEqual([40, 41, 42, 43, 44]);
  });

  it("clamps out-of-range and junk pages", () => {
    expect(paginate(items, 99).page).toBe(3);
    expect(paginate(items, 0).page).toBe(1);
    expect(paginate(items, NaN).page).toBe(1);
  });

  it("has one empty page when there's nothing", () => {
    expect(paginate([], 1)).toEqual({ items: [], page: 1, pages: 1 });
  });
});

describe("isSiteSort", () => {
  it("accepts known sorts only", () => {
    expect(isSiteSort("likes")).toBe(true);
    expect(isSiteSort("toString")).toBe(false);
    expect(isSiteSort(undefined)).toBe(false);
  });
});
