import { Agent } from "@atproto/api";
import type { Context } from "hono";
import type { AppEnv } from "../env.ts";
import { getOAuthClient, hasRequiredScopes } from "./client.ts";
import { readSessionCookie } from "./cookie.ts";

export interface SessionAgent {
  agent: Agent;
  did: string;
  /** False when the session predates a scope Apollo now needs; the user must sign in again. */
  scopesOk: boolean;
}

/**
 * Resolve the caller's OAuth session from the signed cookie and return an
 * authenticated `Agent`. Returns null when there is no valid cookie or the
 * stored session is gone / unrefreshable.
 */
export async function getSessionAgent<E extends { Bindings: AppEnv }>(
  c: Context<E>,
): Promise<SessionAgent | null> {
  const did = await readSessionCookie(c.env.COOKIE_SECRET, c.req.header("Cookie"));
  if (!did) return null;

  try {
    const client = await getOAuthClient(c.env);
    const oauthSession = await client.restore(did);
    const info = await oauthSession.getTokenInfo(false);
    return { agent: new Agent(oauthSession), did, scopesOk: hasRequiredScopes(info.scope) };
  } catch {
    return null;
  }
}
