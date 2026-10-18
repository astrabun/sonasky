import { blockClass } from "./css.ts";
import { utf8Bytes } from "./fields.ts";
import type { CommunityBlockDefinition } from "./types.ts";

export const BLOCK_SCRIPT_MAX_BYTES = 8192;

/**
 * Things a block's script may not do, with the reason shown to contributors.
 * These are a first line of defense for review, not a sandbox: pages already
 * run in Apollo's sandboxed, network-less iframe, and every block script is
 * read by a maintainer before it's merged.
 */
const FORBIDDEN: [RegExp, string][] = [
  [/\\u|\\x/, "must not use \\u or \\x escapes (type the character itself)"],
  [/\beval\s*\(|\bFunction\s*\(/, "must not use eval() or Function()"],
  [
    /\bset(Timeout|Interval)\s*\(\s*["'`]/,
    "must pass a function, not a string, to setTimeout/setInterval",
  ],
  [
    /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|\bimport\s*\(|importScripts/,
    "must not load anything - blocks work with what's already on the page",
  ],
  [
    /innerHTML|outerHTML|insertAdjacentHTML|document\.write|createContextualFragment|setHTML|srcdoc|DOMParser/,
    "must not write HTML - build elements with document.createElement and textContent",
  ],
  [
    /createElement\s*\(\s*["'`](script|iframe|object|embed)/i,
    "must not create script, iframe, object or embed elements",
  ],
  [/setAttribute\s*\(\s*["'`]on/i, "must not set on* attributes - use addEventListener"],
  [
    /postMessage|\b(window|self|globalThis)\.(top|parent|opener|frames)\b/,
    "must not talk to the page around the site",
  ],
  [/localStorage|sessionStorage|indexedDB|document\.cookie/, "must not store anything"],
  [/<\/script/i, "must not contain </script"],
];

/** Problems with a block's script, as messages. */
export function scriptProblems(js: string): string[] {
  const problems: string[] = [];
  if (utf8Bytes(js) > BLOCK_SCRIPT_MAX_BYTES) {
    problems.push(`script must be ${BLOCK_SCRIPT_MAX_BYTES} bytes or less`);
  }
  for (const [re, message] of FORBIDDEN) {
    if (re.test(js)) problems.push(`script ${message}`);
  }
  return problems;
}

/**
 * The file Apollo serves for a block's script ("" when it has none). The
 * contributor's code becomes the body of a function that runs once per block
 * on the page, after the page has loaded, with `block` as its wrapper element.
 */
export function blockScriptSource(def: CommunityBlockDefinition): string {
  if (!def.script?.trim()) return "";
  return `// Community block "${def.id}" from @sonasky/apollo-blocks
(() => {
  "use strict";
  const setup = (block) => {
${def.script}
  };
  const run = () => {
    for (const block of document.querySelectorAll(${JSON.stringify(`.${blockClass(def.id)}`)})) {
      try {
        setup(block);
      } catch (err) {
        console.error(${JSON.stringify(`apollo block ${def.id}:`)}, err);
      }
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
`;
}

/** Short content hash of a block's script, for cache-busting its URL. */
export function blockScriptVersion(def: CommunityBlockDefinition): string {
  // FNV-1a, 32-bit.
  let hash = 0x811c9dc5;
  for (const ch of blockScriptSource(def)) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
