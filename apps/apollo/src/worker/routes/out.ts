/**
 * `/out?url=...` - every link click on a hosted site comes through here (via
 * the viewer shell). Apollo-internal and allowlisted links redirect straight
 * through; anything else gets an interstitial that shows exactly where the
 * visitor is headed before they choose to continue.
 */

import { Hono } from "hono";
import { classifyLink } from "../../shared/links.ts";
import { hostnameToUnicode } from "../../shared/punycode.ts";
import { origin, type AppEnv } from "../env.ts";
import { esc } from "../render/escape.ts";
import { BACK_SCRIPT, staticPage } from "../render/pages.ts";

export const outRoutes = new Hono<{ Bindings: AppEnv }>();

outRoutes.get("/out", (c) => {
  const raw = c.req.query("url") ?? "";
  const link =
    raw.length <= 4096 ? classifyLink(raw, origin(c.env.PUBLIC_URL)) : { kind: "blocked" as const };

  if (
    (link.kind === "internal" || link.kind === "trusted" || link.kind === "mailto") &&
    link.href
  ) {
    return c.redirect(link.href, 302);
  }

  if (link.kind === "blocked" || !link.href || !link.host) {
    return staticPage({
      title: "Link can't be opened",
      status: 400,
      backScript: true,
      body: `<h1>This link can't be opened</h1><p>Apollo only opens regular web links (http and https).</p><div class="actions"><a class="btn btn-primary" href="/" data-back>Go back</a></div>`,
    });
  }

  // Show the Unicode form next to the punycode one so look-alike domains stand out.
  const unicodeHost = hostnameToUnicode(link.host);
  const displayHost = link.host;
  const idnWarning = link.idn
    ? `<p class="warn">This address uses international characters (it displays as <strong>${esc(
        unicodeHost,
      )}</strong>). They are sometimes used to imitate well-known sites. Check it carefully.</p>`
    : "";
  const httpWarning = link.href.startsWith("http:")
    ? `<p class="warn">This link isn't secure (no HTTPS). Don't enter passwords or personal details there.</p>`
    : "";

  return staticPage({
    title: "Leaving Apollo",
    backScript: true,
    body: `<h1>You're leaving Apollo</h1><p>This link goes to a site outside SonaSky Apollo and Bluesky:</p><p class="host">${esc(
      displayHost,
    )}</p><code class="url">${esc(link.href)}</code>${idnWarning}${httpWarning}<p>Apollo doesn't check other sites. Only continue if you trust where this goes, and never enter your Bluesky password on another site.</p><div class="actions"><a class="btn" href="/" data-back>Go back</a><a class="btn btn-primary" href="${esc(
      link.href,
    )}" rel="noopener noreferrer">Continue to ${esc(displayHost)}</a></div>`,
  });
});

outRoutes.get("/_apollo/back.js", () => {
  return new Response(BACK_SCRIPT, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
});
