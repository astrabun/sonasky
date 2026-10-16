/** Page/post/style/script/layout rkeys double as URL slugs. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Slugs that would collide with viewer routes (`/@actor/blog/...`). */
export const RESERVED_PAGE_SLUGS = new Set(["blog"]);

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_RE.test(value);
}

/** Best-effort slug from a human title: "My Cool Page!" -> "my-cool-page". */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return slug || "page";
}
