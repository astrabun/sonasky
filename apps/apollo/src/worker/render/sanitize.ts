/**
 * Allowlist HTML sanitizer built on workerd's `HTMLRewriter` (a real streaming
 * HTML tokenizer, not regexes). It runs on every piece of author HTML - raw
 * HTML pages, markdown output, text blocks and custom layouts.
 *
 * This is defense in depth. The usercontent CSP already blocks inline script,
 * external resources, form posts and frame navigation; the sanitizer makes sure
 * the markup itself carries no script entry points, so the only way JS reaches
 * a page is through an explicit, reportable `app.sonasky.apollo.script` record.
 */

/** Elements dropped together with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "noscript",
  "template",
  "svg",
  "math",
  "base",
  "link",
  "meta",
  "title",
  "head",
  "portal",
  "fencedframe",
]);

const ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "audio",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "br",
  "button",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "li",
  "main",
  "mark",
  "meter",
  "nav",
  "ol",
  "optgroup",
  "option",
  "output",
  "p",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "section",
  "select",
  "small",
  "source",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "track",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
]);

const GLOBAL_ATTRS = new Set([
  "id",
  "class",
  "title",
  "lang",
  "dir",
  "role",
  "hidden",
  "tabindex",
  "style",
  "translate",
]);

const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href"]),
  img: new Set(["src", "alt", "width", "height", "loading", "decoding"]),
  video: new Set([
    "src",
    "poster",
    "width",
    "height",
    "controls",
    "loop",
    "muted",
    "playsinline",
    "autoplay",
    "preload",
  ]),
  audio: new Set(["src", "controls", "loop", "muted", "preload"]),
  source: new Set(["src", "type", "media"]),
  track: new Set(["src", "kind", "srclang", "label", "default"]),
  ol: new Set(["start", "reversed", "type"]),
  li: new Set(["value"]),
  td: new Set(["colspan", "rowspan", "headers"]),
  th: new Set(["colspan", "rowspan", "headers", "scope", "abbr"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  details: new Set(["open", "name"]),
  time: new Set(["datetime"]),
  data: new Set(["value"]),
  del: new Set(["datetime"]),
  ins: new Set(["datetime"]),
  meter: new Set(["value", "min", "max", "low", "high", "optimum"]),
  progress: new Set(["value", "max"]),
  label: new Set(["for"]),
  output: new Set(["for", "name"]),
  button: new Set(["type", "name", "value", "disabled"]),
  select: new Set(["name", "multiple", "disabled", "size", "required"]),
  option: new Set(["value", "selected", "disabled", "label"]),
  optgroup: new Set(["label", "disabled"]),
  textarea: new Set([
    "name",
    "rows",
    "cols",
    "placeholder",
    "maxlength",
    "disabled",
    "readonly",
    "required",
  ]),
  input: new Set([
    "type",
    "name",
    "value",
    "checked",
    "disabled",
    "placeholder",
    "min",
    "max",
    "step",
    "maxlength",
    "readonly",
    "required",
    "list",
    "size",
  ]),
};

/** Input types that only exist to collect secrets / files - an easy phishing tell, so they're removed. */
const BLOCKED_INPUT_TYPES = new Set(["password", "file", "hidden", "image", "submit"]);

const URL_ATTRS = new Set(["href", "src", "poster"]);

export interface SanitizeOptions {
  /** Rewrite an `href`. Return null to drop the attribute. */
  rewriteHref: (href: string) => string | null;
  /** Rewrite a `src` / `poster`. Return null to drop the attribute. */
  rewriteSrc: (src: string) => string | null;
}

function isAllowedAttr(tag: string, name: string): boolean {
  if (name.startsWith("on")) return false;
  if (name.startsWith("aria-") || name.startsWith("data-")) return /^[a-z0-9-]+$/.test(name);
  return GLOBAL_ATTRS.has(name) || (TAG_ATTRS[tag]?.has(name) ?? false);
}

/** Strip CSS constructs that can pull in external resources or script. */
function sanitizeInlineStyle(style: string): string | null {
  const lower = style.toLowerCase().replace(/\\/g, "");
  if (/expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding/.test(lower)) return null;
  return style;
}

/** Sanitize a fragment (or document) of author HTML. */
export async function sanitizeHtml(html: string, opts: SanitizeOptions): Promise<string> {
  const rewriter = new HTMLRewriter()
    .onDocument({
      comments(comment) {
        comment.remove();
      },
      doctype() {
        // Doctypes are dropped by re-rendering into our own document shell.
      },
    })
    .on("*", {
      element(el) {
        const tag = el.tagName.toLowerCase();

        if (DROP_WITH_CONTENT.has(tag)) {
          el.remove();
          return;
        }
        if (!ALLOWED_TAGS.has(tag)) {
          // html/body/form/unknown custom elements: keep the children, lose the wrapper.
          el.removeAndKeepContent();
          return;
        }
        if (tag === "input") {
          const type = (el.getAttribute("type") ?? "text").toLowerCase();
          if (BLOCKED_INPUT_TYPES.has(type)) {
            el.remove();
            return;
          }
        }
        if (tag === "button") {
          // No form submission anywhere; buttons are for scripts only.
          el.setAttribute("type", "button");
        }

        const names = [...el.attributes].map(([name]) => name.toLowerCase());
        for (const name of names) {
          if (!isAllowedAttr(tag, name)) {
            el.removeAttribute(name);
            continue;
          }
          const value = el.getAttribute(name) ?? "";
          if (URL_ATTRS.has(name)) {
            const next = name === "href" ? opts.rewriteHref(value) : opts.rewriteSrc(value);
            if (next === null) el.removeAttribute(name);
            else el.setAttribute(name, next);
          } else if (name === "style") {
            const next = sanitizeInlineStyle(value);
            if (next === null) el.removeAttribute(name);
          }
        }
      },
    })
    .on("style", {
      text(chunk) {
        // Same rules as inline styles, applied to the whole <style> body.
        if (/expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding/i.test(chunk.text)) {
          chunk.replace("");
        }
      },
    });

  return rewriter.transform(new Response(html)).text();
}

/** Escape a stylesheet for embedding inside a <style> element. */
export function safeStyleText(css: string): string {
  return css.replace(/<\/(style)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");
}
