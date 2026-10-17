/**
 * Link classification for the external-link interstitial. Shared by the Worker
 * (rewriting hrefs at render time, the `/out` page) and the viewer shell
 * script (deciding what a click inside the sandboxed site may do).
 *
 * Matching is always on the parsed URL's hostname - exact or dot-suffix - never
 * a substring of the raw href, so `bsky.app.evil.com`, `evil.com/bsky.app` and
 * `bsky.app@evil.com` all classify as external.
 */

/** Hosts (and their subdomains, when `subdomains` is set) reachable without a warning. */
export const TRUSTED_HOSTS: readonly { host: string; subdomains: boolean }[] = [
  { host: "apollo.sonasky.app", subdomains: false },
  { host: "sonasky.app", subdomains: true },
  { host: "bsky.social", subdomains: true },
  { host: "bsky.app", subdomains: false },
];

export type LinkKind =
  /** Another page on Apollo (same origin as the editor). */
  | "internal"
  /** Allowlisted host - navigate directly. */
  | "trusted"
  /** Everything else on http(s) - goes through `/out`. */
  | "external"
  /** `mailto:` - opens the visitor's mail app, no site visit. */
  | "mailto"
  /** Anything we refuse to follow (`javascript:`, `data:`, unparseable, ...). */
  | "blocked";

export interface ClassifiedLink {
  kind: LinkKind;
  /** Normalized absolute URL (absent for `blocked`). */
  href?: string;
  /** Lowercased hostname without a trailing dot (http(s) only). */
  host?: string;
  /** Hostname contains an IDN / punycode label - worth calling out on `/out`. */
  idn?: boolean;
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

export function isTrustedHost(host: string): boolean {
  const h = normalizeHost(host);
  return TRUSTED_HOSTS.some(
    (entry) => h === entry.host || (entry.subdomains && h.endsWith(`.${entry.host}`)),
  );
}

/**
 * Classify `href`. Relative hrefs resolve against `base` (the page they appear
 * on); `publicOrigin` is the editor origin (`https://apollo.sonasky.app`), so a
 * dev origin like `http://127.0.0.1:8787` also counts as internal.
 */
export function classifyLink(href: string, publicOrigin: string, base?: string): ClassifiedLink {
  let url: URL;
  try {
    url = new URL(href.trim(), base ?? publicOrigin);
  } catch {
    return { kind: "blocked" };
  }

  if (url.protocol === "mailto:") return { kind: "mailto", href: url.href };
  if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "blocked" };

  const host = normalizeHost(url.hostname);
  const idn = host.split(".").some((label) => label.startsWith("xn--"));
  // Embedded credentials are a classic way to make a URL look like somewhere
  // else ("https://bsky.app:pw@evil.com"); the host is still evil.com, but never
  // let such a URL skip the warning.
  const hasCredentials = Boolean(url.username || url.password);

  let publicUrl: URL | undefined;
  try {
    publicUrl = new URL(publicOrigin);
  } catch {
    publicUrl = undefined;
  }

  if (!hasCredentials && publicUrl && url.origin === publicUrl.origin) {
    return { kind: "internal", href: url.href, host, idn };
  }
  if (!hasCredentials && url.protocol === "https:" && isTrustedHost(host)) {
    return { kind: "trusted", href: url.href, host, idn };
  }
  return { kind: "external", href: url.href, host, idn };
}

const SITE_PATH_RE = /^[a-z0-9-]*(\/[a-z0-9-]+)?$/;
const MEDIA_REF_RE = /^media:[a-zA-Z0-9._~:-]{1,512}$/;

/**
 * Check a link an author typed (button, nav item, event link). Allowed:
 * absolute http(s)/mailto URLs, `media:<rkey>`, `#anchors`, and relative paths
 * to pages on the same site ("/about", "blog/hello"). Returns an error message
 * suitable for showing next to the field, or null when it's fine.
 */
export function linkValueError(value: string): string | null {
  const v = value.trim();
  if (!v) return "Add a link.";
  if (v.startsWith("#")) return null;
  if (MEDIA_REF_RE.test(v)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    try {
      const url = new URL(v);
      if (url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:") {
        return null;
      }
    } catch {
      return "That doesn't look like a valid web address.";
    }
    return "Links must start with https:// (or mailto: for email).";
  }
  if (v.startsWith("//")) return "Links must start with https://.";
  const path = v
    .replace(/[?#].*$/, "")
    .replace(/^(\.\/|\/)+/, "")
    .replace(/\/+$/, "");
  if (SITE_PATH_RE.test(path)) return null;
  if (/^[^\s/]+\.[a-z]{2,}(\/.*)?$/i.test(v)) return "Add https:// to the start of the address.";
  return "That doesn't look like a link to a page on your site.";
}

/** URL of the interstitial page for an external link. */
export function interstitialHref(publicOrigin: string, target: string): string {
  return `${publicOrigin.replace(/\/+$/, "")}/out?${new URLSearchParams({ url: target }).toString()}`;
}
