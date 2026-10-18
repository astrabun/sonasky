import { utf8Bytes } from "./fields.ts";
import type { CommunityBlockDefinition } from "./types.ts";

export const BLOCK_CSS_MAX_BYTES = 4096;

/** At-rules a block's CSS may use. Everything else (`@import`, `@font-face`, ...) is refused. */
export const ALLOWED_AT_RULES: readonly string[] = ["media", "container", "supports"];

/** The class on every rendered community block's wrapper. */
export function blockClass(id: string): string {
  return `apollo-cb-${id}`;
}

/**
 * Problems with a block's CSS, as messages. Blocks may only style themselves,
 * so the CSS is nested inside the block's class and must not be able to break
 * out of it (balanced braces) or load anything (no `url()` / `@import`).
 */
export function cssProblems(css: string): string[] {
  const problems: string[] = [];
  if (utf8Bytes(css) > BLOCK_CSS_MAX_BYTES) {
    problems.push(`css must be ${BLOCK_CSS_MAX_BYTES} bytes or less`);
  }
  const forbidden: [RegExp, string][] = [
    [/<\//, "must not contain </"],
    [/<!--/, "must not contain <!--"],
    [/\\/, "must not use \\ escapes"],
    [/url\s*\(/i, "must not use url() - blocks can't load images or fonts"],
    [/image-set\s*\(/i, "must not use image-set()"],
    [/expression\s*\(/i, "must not use expression()"],
    [/position\s*:\s*fixed/i, "must not use position: fixed - blocks stay inside the page"],
  ];
  for (const [re, message] of forbidden) {
    if (re.test(css)) problems.push(`css ${message}`);
  }
  for (const m of css.matchAll(/@([a-z-]+)/gi)) {
    if (!ALLOWED_AT_RULES.includes(m[1].toLowerCase())) {
      problems.push(`css must not use @${m[1]} (allowed: @${ALLOWED_AT_RULES.join(", @")})`);
    }
  }
  // Ignore braces inside comments and strings (e.g. `content: "}"`).
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"\n]*"|'[^'\n]*'/g, '""');
  if (/\/\*|"|'/.test(bare.replace(/""/g, ""))) {
    problems.push("css has an unclosed comment or string");
  }
  let depth = 0;
  for (const ch of bare) {
    if (ch === "{") depth++;
    else if (ch === "}" && --depth < 0) break;
  }
  if (depth !== 0) problems.push("css has unbalanced { }");
  return problems;
}

/** A block's CSS, scoped to its wrapper with native CSS nesting ("" when it has none). */
export function scopedCss(def: CommunityBlockDefinition): string {
  return def.css?.trim() ? `.${blockClass(def.id)}{${def.css}}` : "";
}
