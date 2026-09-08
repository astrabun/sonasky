import { Agent } from "@atproto/api";
import type { Context } from "hono";
import type { AppEnv } from "../env.ts";
import { getOAuthClient } from "./client.ts";
import { readSessionCookie } from "./cookie.ts";

export interface SessionAgent {
  agent: Agent;
  did: string;
}

/**
 * Resolve the caller's OAuth session from the signed cookie and return an
 * authenticated `Agent`. Returns null when there is no valid cookie or the
 * stored session is gone / unrefreshable.
 */
export async function getSessionAgent(
  c: Context<{ Bindings: AppEnv }>,
): Promise<SessionAgent | null> {
  const did = await readSessionCookie(c.env.COOKIE_SECRET, c.req.header("Cookie"));
  if (!did) return null;

  try {
    const client = await getOAuthClient(c.env);
    const oauthSession = await client.restore(did);
    return { agent: new Agent(oauthSession), did };
  } catch {
    return null;
  }
}
