/**
 * Sorting, search and random picks for the public ring directory.
 */

import type { DirectoryRing } from "./dto.ts";
import { pickRandom } from "./random.ts";

export const RING_SORTS = {
  recommended: "Recommended",
  members: "Most sites",
  updated: "Recently updated",
  newest: "Newest",
  name: "Name (A-Z)",
} as const;

export type RingSort = keyof typeof RING_SORTS;

export function isRingSort(value: unknown): value is RingSort {
  return typeof value === "string" && Object.hasOwn(RING_SORTS, value);
}

const DAY_MS = 86_400_000;
/** Days for the freshness boost to fall to ~37% of its peak. */
const FRESHNESS_DAYS = 45;

function time(value: string): number {
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * "Recommended": bigger rings rank higher with diminishing returns, and rings
 * their owner has touched recently get a boost that fades but never hits zero,
 * so a big established ring still beats a fresh ring of one.
 */
export function scoreRing(ring: DirectoryRing, now = Date.now()): number {
  const ageDays = Math.max(0, (now - time(ring.updatedAt)) / DAY_MS);
  return Math.log2(1 + ring.activeMembers) * (0.4 + 0.6 * Math.exp(-ageDays / FRESHNESS_DAYS));
}

const byName = (a: DirectoryRing, b: DirectoryRing) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

function comparator(sort: RingSort, now: number): (a: DirectoryRing, b: DirectoryRing) => number {
  switch (sort) {
    case "recommended":
      return (a, b) =>
        scoreRing(b, now) - scoreRing(a, now) || b.activeMembers - a.activeMembers || byName(a, b);
    case "members":
      return (a, b) => b.activeMembers - a.activeMembers || byName(a, b);
    case "updated":
      return (a, b) => time(b.updatedAt) - time(a.updatedAt) || byName(a, b);
    case "newest":
      return (a, b) => time(b.createdAt) - time(a.createdAt) || byName(a, b);
    case "name":
      return (a, b) => byName(a, b) || b.activeMembers - a.activeMembers;
  }
}

export function sortRings(
  rings: DirectoryRing[],
  sort: RingSort,
  now = Date.now(),
): DirectoryRing[] {
  return [...rings].sort(comparator(sort, now));
}

/** Lowercase, accents stripped, so "cafe" finds "Café". */
export function fold(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

function tokens(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

/** How well one token matches; 0 = no match. */
function tokenScore(token: string, name: string, handle: string, description: string): number {
  if (name.startsWith(token) || name.includes(` ${token}`)) return 4;
  if (name.includes(token)) return 3;
  if (handle.includes(token)) return 2;
  if (description.includes(token)) return 1;
  return 0;
}

/**
 * Rings matching every word of `query` in their name, owner handle or
 * description, best matches first (name > handle > description), then by
 * `sort`. An empty query is just `sortRings`.
 */
export function searchRings(
  rings: DirectoryRing[],
  query: string,
  sort: RingSort = "recommended",
  now = Date.now(),
): DirectoryRing[] {
  const words = tokens(query);
  if (words.length === 0) return sortRings(rings, sort, now);
  const scored: { ring: DirectoryRing; score: number }[] = [];
  for (const ring of rings) {
    const name = fold(ring.name);
    const handle = fold(ring.ownerHandle ?? "");
    const description = fold(ring.description ?? "");
    let score = 0;
    for (const word of words) {
      const s = tokenScore(word, name, handle, description);
      if (s === 0) {
        score = 0;
        break;
      }
      score += s;
    }
    if (score > 0) scored.push({ ring, score });
  }
  const tieBreak = comparator(sort, now);
  return scored.sort((a, b) => b.score - a.score || tieBreak(a.ring, b.ring)).map((s) => s.ring);
}

/** A random ring, avoiding the one at `notUri` when there's any other choice. */
export function pickRandomRing(rings: DirectoryRing[], notUri?: string): DirectoryRing | null {
  return pickRandom(rings, (r) => r.uri, notUri);
}
