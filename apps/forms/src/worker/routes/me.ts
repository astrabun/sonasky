import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { getSessionAgent } from "../oauth/session.ts";
import type { MeResponse } from "../../shared/dto.ts";

export const meRoutes = new Hono<{ Bindings: AppEnv }>();

/** Who is the caller? Never 401 - the client uses this to decide what to render. */
meRoutes.get("/api/me", async (c) => {
  const session = await getSessionAgent(c);
  if (!session) return c.json<MeResponse>({ authenticated: false });

  let handle: string | undefined;
  try {
    const res = await session.agent.com.atproto.repo.describeRepo({ repo: session.did });
    handle = res.data.handle;
  } catch {
    // handle is best-effort; the DID is authoritative
  }

  return c.json<MeResponse>({ authenticated: true, did: session.did, handle });
});
