import { isGoogleFontFamily } from "@sonasky/apollo-themes";
import type { ThemeTokens } from "./records.ts";
import { DEFAULT_THEME, HEX_COLOR_RE, THEME_FONTS, THEME_RADII, THEME_WIDTHS } from "./themes.ts";

/**
 * Re-validate tokens at render time (records can be written by any client, not
 * just Apollo) so nothing but known values ever reaches the stylesheet.
 */
function safeTokens(tokens: Partial<ThemeTokens> | undefined): ThemeTokens {
  const t = { ...DEFAULT_THEME };
  if (!tokens) return t;
  for (const key of ["background", "surface", "text", "muted", "accent", "accentText"] as const) {
    const v = tokens[key];
    if (typeof v === "string" && HEX_COLOR_RE.test(v)) t[key] = v;
  }
  // Links fall back to the accent (the theme's own, not the default's).
  t.link =
    typeof tokens.link === "string" && HEX_COLOR_RE.test(tokens.link) ? tokens.link : t.accent;
  if (tokens.fontBody && tokens.fontBody in THEME_FONTS) t.fontBody = tokens.fontBody;
  if (tokens.fontHeading && tokens.fontHeading in THEME_FONTS) t.fontHeading = tokens.fontHeading;
  if (tokens.radius && tokens.radius in THEME_RADII) t.radius = tokens.radius;
  if (tokens.width && tokens.width in THEME_WIDTHS) t.width = tokens.width;
  const body = tokens.googleFonts?.body;
  const heading = tokens.googleFonts?.heading;
  t.googleFonts =
    isGoogleFontFamily(body) || isGoogleFontFamily(heading)
      ? {
          ...(isGoogleFontFamily(body) ? { body } : {}),
          ...(isGoogleFontFamily(heading) ? { heading } : {}),
        }
      : undefined;
  return t;
}

/** Google font families a theme uses (validated, de-duplicated). */
export function googleFontFamilies(tokens: Partial<ThemeTokens> | undefined): string[] {
  const g = safeTokens(tokens).googleFonts;
  return [...new Set([g?.body, g?.heading].filter((f): f is string => Boolean(f)))];
}

/**
 * Apollo's font stylesheet on the usercontent origin. It proxies Google Fonts,
 * so visitors' browsers never talk to Google directly.
 */
export function googleFontsHref(usercontentOrigin: string, families: string[]): string {
  const params = new URLSearchParams();
  for (const f of families) params.append("family", f);
  return `${usercontentOrigin}/_apollo/fonts.css?${params.toString()}`;
}

function fontStack(family: string | undefined, fallback: string): string {
  // Family names are validated to letters, digits and spaces, so quoting is safe.
  return family ? `"${family}", ${fallback}` : fallback;
}

/** Base stylesheet for every Apollo site: theme variables + styles for the built-in blocks. */
export function themeCss(tokens: Partial<ThemeTokens> | undefined): string {
  const t = safeTokens(tokens);
  return `:root{--apollo-bg:${t.background};--apollo-surface:${t.surface};--apollo-text:${t.text};--apollo-muted:${t.muted};--apollo-accent:${t.accent};--apollo-accent-text:${t.accentText};--apollo-link:${t.link ?? t.accent};--apollo-radius:${THEME_RADII[t.radius].css};--apollo-width:${THEME_WIDTHS[t.width].css};--apollo-font-body:${fontStack(t.googleFonts?.body, THEME_FONTS[t.fontBody].stack)};--apollo-font-heading:${fontStack(t.googleFonts?.heading, THEME_FONTS[t.fontHeading].stack)}}
*,*::before,*::after{box-sizing:border-box}
html{background:var(--apollo-bg);color:var(--apollo-text);font-family:var(--apollo-font-body);line-height:1.6;-webkit-text-size-adjust:100%}
body{margin:0}
.apollo-wrap{max-width:var(--apollo-width);margin:0 auto;padding:32px 16px 48px}
.apollo-header{margin-bottom:24px}
.apollo-site-title{font-family:var(--apollo-font-heading);font-size:1.25rem;font-weight:700;color:var(--apollo-text);text-decoration:none}
.apollo-nav ul{list-style:none;display:flex;flex-wrap:wrap;gap:4px 16px;padding:0;margin:8px 0 0}
.apollo-nav a{color:var(--apollo-muted);text-decoration:none;font-weight:500}
.apollo-nav a[aria-current=page]{color:var(--apollo-link)}
.apollo-footer{margin-top:48px;color:var(--apollo-muted);font-size:.85rem;text-align:center}
.apollo-footer a{color:inherit}
h1,h2,h3,h4,h5,h6{font-family:var(--apollo-font-heading);line-height:1.25;margin:1.4em 0 .5em}
h1{font-size:2rem}h2{font-size:1.5rem}h3{font-size:1.2rem}
p{margin:0 0 1em}
a{color:var(--apollo-link)}
img,video{max-width:100%;height:auto;border-radius:var(--apollo-radius)}
blockquote{margin:1em 0;padding:.25em 1em;border-left:4px solid var(--apollo-accent);color:var(--apollo-muted)}
pre,code{font-family:${THEME_FONTS.mono.stack};font-size:.9em}
pre{background:var(--apollo-surface);padding:12px;border-radius:var(--apollo-radius);overflow-x:auto}
table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid color-mix(in srgb,var(--apollo-muted) 35%,transparent);padding:6px 10px;text-align:left}
hr,.apollo-divider{border:0;border-top:1px solid color-mix(in srgb,var(--apollo-muted) 35%,transparent);margin:2em 0}
.apollo-spacer-small{height:16px}.apollo-spacer-medium{height:40px}.apollo-spacer-large{height:80px}
.apollo-image{margin:1.5em 0;text-align:center}
.apollo-image-small img{max-width:min(100%,240px)}.apollo-image-medium img{max-width:min(100%,480px)}
.apollo-image figcaption{color:var(--apollo-muted);font-size:.9rem;margin-top:6px}
.apollo-buttons{display:flex;flex-direction:column;gap:10px;margin:1.5em 0}
.apollo-button{display:block;padding:14px 18px;background:var(--apollo-accent);color:var(--apollo-accent-text);border-radius:var(--apollo-radius);text-align:center;text-decoration:none;font-weight:600}
.apollo-button:hover{filter:brightness(1.08)}
.apollo-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:1.5em 0}
.apollo-gallery img{width:100%;aspect-ratio:1;object-fit:cover}
.apollo-card{display:block;background:var(--apollo-surface);color:var(--apollo-text);border-radius:var(--apollo-radius);padding:16px;margin:1.5em 0;text-decoration:none;border:1px solid color-mix(in srgb,var(--apollo-muted) 25%,transparent)}
.apollo-card-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.apollo-card-avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;flex:none}
.apollo-card-name{font-weight:700}
.apollo-card-sub{color:var(--apollo-muted);font-size:.9rem}
.apollo-card-text{white-space:pre-wrap;margin:0}
.apollo-card-cta{display:inline-block;margin-top:12px;padding:8px 14px;background:var(--apollo-accent);color:var(--apollo-accent-text);border-radius:var(--apollo-radius);font-weight:600}
.apollo-event-name{font-family:var(--apollo-font-heading);font-size:1.3rem;font-weight:700;margin:0 0 6px}
.apollo-event-meta{margin:2px 0;color:var(--apollo-muted);display:flex;align-items:center;gap:6px}
.apollo-icon{flex:none}
.apollo-post-meta{color:var(--apollo-muted);font-size:.9rem;margin-top:-.5em}
.apollo-post-list{list-style:none;padding:0}
.apollo-post-list li{margin:0 0 1.25em}
.apollo-post-list a{font-weight:600;font-size:1.1rem}
`;
}
