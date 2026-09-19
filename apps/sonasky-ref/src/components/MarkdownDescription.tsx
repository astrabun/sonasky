import DOMPurify from "dompurify";
import { marked } from "marked";
import { isTrustedLinkDomain } from "../helpers/trustedLinks";

const ALLOWED_TAGS = [
  "a",
  "blockquote",
  "br",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "input",
  "li",
  "ol",
  "p",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const ALLOWED_ATTR = ["checked", "disabled", "type", "href", "target", "rel"];

marked.use({ breaks: true, gfm: true });

// Any link that doesn't point at a trusted SonaSky/Bluesky domain gets routed through an
// interstitial warning page instead of navigating off-site directly.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "A") return;

  const href = node.getAttribute("href");
  if (!href) return;

  node.setAttribute("rel", "noopener noreferrer");

  let url: URL;
  try {
    url = new URL(href, globalThis.location.origin);
  } catch {
    node.removeAttribute("href");
    return;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    node.removeAttribute("href");
    return;
  }

  if (isTrustedLinkDomain(url.hostname)) {
    node.setAttribute("target", "_blank");
  } else {
    node.setAttribute("href", `/leaving?url=${encodeURIComponent(url.href)}`);
    node.setAttribute("target", "_self");
  }
});

interface Props {
  content: string;
}

export function MarkdownDescription({ content }: Props) {
  const html = DOMPurify.sanitize(marked.parse(content) as string, {
    ALLOWED_ATTR,
    ALLOWED_TAGS,
  });

  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className="prose prose-sm dark:prose-invert max-w-none [&_input[type=checkbox]]:mr-1"
    />
  );
}
