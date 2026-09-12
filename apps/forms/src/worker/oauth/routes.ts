import { OAuthResolverError } from "@atproto/oauth-client";
import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { clientMetadata, getOAuthClient } from "./client.ts";
import { clearSessionCookie, readSessionCookie, serializeSessionCookie } from "./cookie.ts";

const HANDLE_INPUT_RE = /^[^\s]{1,512}$/;
// A real handle is a dotted domain (e.g. alice.bsky.social). The most common
// mistake is typing it like an email address (alice@bsky.social), so that shape
// gets its own error with a corrected suggestion instead of a generic failure.
const HANDLE_SHAPE_RE = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/;

/** Only allow returning to a same-origin path, never an absolute/protocol-relative URL. */
function safeReturnPath(value: string | undefined): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

/** Build a redirect back to the app that carries a specific, user-facing sign-in error. */
function loginFailureRedirect(returnPath: string, code: string, hint?: string): string {
  const params = new URLSearchParams({ auth_error: code });
  if (hint) params.set("hint", hint);
  const sep = returnPath.includes("?") ? "&" : "?";
  return `${returnPath}${sep}${params.toString()}`;
}

export const oauthRoutes = new Hono<{ Bindings: AppEnv }>();

/** Public OAuth client metadata document. */
oauthRoutes.get("/client-metadata.json", (c) => {
  return c.json(clientMetadata(c.env) as Record<string, unknown>);
});

/** JWKS for the confidential client. 404 when running as a public client. */
oauthRoutes.get("/jwks.json", async (c) => {
  if (!c.env.OAUTH_PRIVATE_KEY?.trim()) return c.notFound();
  const client = await getOAuthClient(c.env);
  return c.json(client.jwks as unknown as Record<string, unknown>);
});

/** Begin sign-in: redirect the browser to the user's authorization server. */
oauthRoutes.get("/oauth/login", async (c) => {
  const returnPath = safeReturnPath(c.req.query("return"));
  const raw = c.req.query("handle")?.trim();
  if (!raw || !HANDLE_INPUT_RE.test(raw)) {
    return c.redirect(loginFailureRedirect(returnPath, "invalid_handle"), 302);
  }
  const handle = raw.replace(/^@/, "").toLowerCase();
  if (!HANDLE_SHAPE_RE.test(handle)) {
    // Handles look like domains, not emails.
    const hint = handle.includes("@") ? handle.replace(/@/g, ".") : undefined;
    return c.redirect(loginFailureRedirect(returnPath, "invalid_handle", hint), 302);
  }
  try {
    const client = await getOAuthClient(c.env);
    const url = await client.authorize(handle, { state: returnPath });
    return c.redirect(url.toString(), 302);
  } catch (err) {
    console.error("oauth/login failed", err);
    const code = err instanceof OAuthResolverError ? "handle_not_found" : "sign_in_failed";
    return c.redirect(loginFailureRedirect(returnPath, code), 302);
  }
});

/** OAuth redirect target: exchange the code, set the session cookie. */
oauthRoutes.get("/oauth/callback", async (c) => {
  const params = new URL(c.req.url).searchParams;
  const secure = c.env.PUBLIC_URL.startsWith("https:");
  try {
    const client = await getOAuthClient(c.env);
    const { session, state } = await client.callback(params);
    c.header("Set-Cookie", await serializeSessionCookie(c.env.COOKIE_SECRET, session.did, secure));
    return c.redirect(safeReturnPath(state ?? undefined), 302);
  } catch (err) {
    console.error("oauth/callback failed", err);
    return c.redirect("/?auth_error=sign_in_failed", 302);
  }
});

/** Sign out: revoke tokens best-effort and clear the cookie. */
oauthRoutes.post("/oauth/logout", async (c) => {
  const did = await readSessionCookie(c.env.COOKIE_SECRET, c.req.header("Cookie"));
  if (did) {
    try {
      const client = await getOAuthClient(c.env);
      await client.revoke(did);
    } catch (err) {
      console.warn("oauth/logout revoke failed", err);
    }
  }
  c.header("Set-Cookie", clearSessionCookie(c.env.PUBLIC_URL.startsWith("https:")));
  return c.json({ ok: true });
});
