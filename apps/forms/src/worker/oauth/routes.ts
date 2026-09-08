import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { clientMetadata, getOAuthClient } from "./client.ts";
import { clearSessionCookie, readSessionCookie, serializeSessionCookie } from "./cookie.ts";

const HANDLE_INPUT_RE = /^[^\s]{1,512}$/;

/** Only allow returning to a same-origin path, never an absolute/protocol-relative URL. */
function safeReturnPath(value: string | undefined): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
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
  const handle = c.req.query("handle")?.trim();
  if (!handle || !HANDLE_INPUT_RE.test(handle)) {
    return c.json({ ok: false, error: "invalid handle" }, 400);
  }
  try {
    const client = await getOAuthClient(c.env);
    const url = await client.authorize(handle, { state: safeReturnPath(c.req.query("return")) });
    return c.redirect(url.toString(), 302);
  } catch (err) {
    console.error("oauth/login failed", err);
    return c.json({ ok: false, error: "could not start sign-in" }, 502);
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
    return c.redirect("/?auth_error=1", 302);
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
