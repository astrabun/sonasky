/**
 * Google Fonts, served through Apollo's usercontent host:
 *
 *   /_apollo/fonts.css?family=Inter&family=Lora  -> Google's CSS, with every font
 *                                                  URL rewritten to the route below
 *   /_apollo/font/s/inter/v13/abc.woff2          -> the font file from fonts.gstatic.com
 *
 * Visitors' browsers only ever talk to Apollo, so Google never sees their IP
 * address, and the site CSP can stay pinned to Apollo's own origin. Font files
 * are versioned and immutable, so they're cached for a year.
 */

import { isGoogleFontFamily } from "@sonasky/apollo-themes";

const GOOGLE_CSS = "https://fonts.googleapis.com/css2";
const GSTATIC = "https://fonts.gstatic.com/";
/** Paths fonts.gstatic.com uses for font files. */
export const GSTATIC_PATH_RE = /^s\/[a-z0-9]+\/v\d+\/[A-Za-z0-9_-]+\.(woff2|woff|ttf)$/;
/** Body + heading. */
export const MAX_FAMILIES = 2;

// Google picks the font format from the User-Agent; a modern browser gets woff2.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/** Validated, de-duplicated families from `?family=` params, or null if any is invalid. */
export function parseFamilies(values: string[]): string[] | null {
  const families = [...new Set(values)];
  if (families.length === 0 || families.length > MAX_FAMILIES) return null;
  return families.every(isGoogleFontFamily) ? families : null;
}

/**
 * Point every font URL in Google's CSS at Apollo's proxy and drop anything
 * else that could load from elsewhere (`@import`, other hosts).
 */
export function rewriteGoogleFontsCss(css: string, usercontentOrigin: string): string {
  return css
    .replace(/@import[^;]*;/gi, "")
    .replace(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/g, (_match, _q: string, url: string) => {
      if (url.startsWith(GSTATIC)) {
        const path = url.slice(GSTATIC.length);
        if (GSTATIC_PATH_RE.test(path)) return `url(${usercontentOrigin}/_apollo/font/${path})`;
      }
      return "url(about:invalid)";
    });
}

/**
 * Fetch one family's CSS. Not every family has italics or a bold weight, and
 * Google rejects requests for styles a family lacks, so try richest first.
 */
async function fetchFamilyCss(family: string): Promise<string | null> {
  const name = family.replace(/ /g, "+");
  const variants = [`${name}:ital,wght@0,400;0,700;1,400;1,700`, `${name}:wght@400;700`, name];
  for (const variant of variants) {
    const res = await fetch(`${GOOGLE_CSS}?family=${variant}&display=swap`, {
      headers: { "user-agent": BROWSER_UA, accept: "text/css,*/*;q=0.1" },
    });
    if (res.ok) return res.text();
  }
  return null;
}

/** Combined, rewritten CSS for the requested families (unknown families are skipped). */
export async function googleFontsCss(
  families: string[],
  usercontentOrigin: string,
): Promise<string> {
  const parts = await Promise.all(families.map(fetchFamilyCss));
  return parts
    .map((css, i) =>
      css ? `/* ${families[i]} */\n${rewriteGoogleFontsCss(css, usercontentOrigin)}` : "",
    )
    .filter(Boolean)
    .join("\n");
}

const FONT_TYPES: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
};

/** Proxy one font file. `path` must already match GSTATIC_PATH_RE. */
export async function fetchFontFile(path: string): Promise<Response | null> {
  const res = await fetch(`${GSTATIC}${path}`, { headers: { "user-agent": BROWSER_UA } });
  if (!res.ok || !res.body) return null;
  const ext = path.slice(path.lastIndexOf(".") + 1);
  return new Response(res.body, {
    headers: {
      "content-type": FONT_TYPES[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      // Fonts load with CORS; sites run in an opaque ("null") origin.
      "access-control-allow-origin": "*",
      "cross-origin-resource-policy": "cross-origin",
      "x-content-type-options": "nosniff",
    },
  });
}
