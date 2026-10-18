/**
 * Sorting and paging for the public site directory.
 */

import type { DirectorySite } from "./dto.ts";

export const SITE_SORTS = {
  likes: "Most liked",
  newest: "Newest",
  oldest: "Oldest",
  updated: "Recently updated",
  linked: "Recently shared on Bluesky",
} as const;

export type SiteSort = keyof typeof SITE_SORTS;

export const DEFAULT_SITE_SORT: SiteSort = "likes";
export const SITES_PER_PAGE = 20;

export function isSiteSort(value: unknown): value is SiteSort {
  return typeof value === "string" && Object.hasOwn(SITE_SORTS, value);
}

function time(value: string | undefined): number {
  const t = value ? Date.parse(value) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

const byTitle = (a: DirectorySite, b: DirectorySite) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: "base" });

function comparator(sort: SiteSort): (a: DirectorySite, b: DirectorySite) => number {
  switch (sort) {
    case "likes":
      return (a, b) => b.likes - a.likes || time(b.updatedAt) - time(a.updatedAt) || byTitle(a, b);
    case "newest":
      return (a, b) => time(b.createdAt) - time(a.createdAt) || byTitle(a, b);
    case "oldest":
      return (a, b) => time(a.createdAt) - time(b.createdAt) || byTitle(a, b);
    case "updated":
      return (a, b) => time(b.updatedAt) - time(a.updatedAt) || byTitle(a, b);
    case "linked":
      // Never-linked sites go last, newest-updated first among them.
      return (a, b) =>
        time(b.lastLinkedAt) - time(a.lastLinkedAt) ||
        time(b.updatedAt) - time(a.updatedAt) ||
        byTitle(a, b);
  }
}

export function sortSites(sites: DirectorySite[], sort: SiteSort): DirectorySite[] {
  return [...sites].sort(comparator(sort));
}

/** 1-based page of `items`, clamped to the pages that exist. */
export function paginate<T>(
  items: T[],
  page: number,
  perPage = SITES_PER_PAGE,
): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { items: items.slice((current - 1) * perPage, current * perPage), page: current, pages };
}
