// A Turborepo remote cache (the /v8/artifacts API turbo speaks) backed by R2.
// CI on pull requests and on main share it, so a build cached on a PR is
// replayed on main after merge instead of being rebuilt.
//
// API reference: https://turborepo.com/docs/core-concepts/remote-caching#self-hosting

// Turbo task hashes are hex; anything else is rejected before it can reach R2.
const ARTIFACT_PATH = /^\/v8\/artifacts\/([0-9a-fA-F]{1,128})$/;
const TEAM = /^[\w.-]{1,100}$/;

// Artifact metadata turbo sends on upload and reads back on download.
const META_HEADERS = ["x-artifact-duration", "x-artifact-tag"] as const;

export interface CacheEnv {
  BUCKET: Pick<R2Bucket, "get" | "head" | "put">;
  TURBO_TOKEN: string;
}

export async function handle(request: Request, env: CacheEnv): Promise<Response> {
  const url = new URL(request.url);

  if (!(await authorized(request, env.TURBO_TOKEN))) {
    return json({ error: "unauthorized" }, 401);
  }

  if (url.pathname === "/v8/artifacts/status") {
    return json({ status: "enabled" });
  }

  // Usage analytics turbo reports after a run; nothing to keep.
  if (url.pathname === "/v8/artifacts/events") {
    return json({});
  }

  const match = ARTIFACT_PATH.exec(url.pathname);
  if (!match) {
    return json({ error: "not found" }, 404);
  }

  // Turbo sends the team as ?slug= or, for ids starting with "team_", ?teamId=.
  // Artifacts are namespaced by it so separate teams can never collide.
  const team = url.searchParams.get("slug") ?? url.searchParams.get("teamId");
  if (!team || !TEAM.test(team)) {
    return json({ error: "missing or invalid team" }, 400);
  }
  const key = `${team}/${match[1].toLowerCase()}`;

  switch (request.method) {
    case "HEAD": {
      const object = await env.BUCKET.head(key);
      return object ? new Response(null, { headers: metaHeaders(object) }) : notFound();
    }
    case "GET": {
      const object = await env.BUCKET.get(key);
      if (!object) return notFound();
      const headers = metaHeaders(object);
      headers.set("content-type", "application/octet-stream");
      headers.set("content-length", String(object.size));
      return new Response(object.body, { headers });
    }
    case "PUT": {
      const customMetadata: Record<string, string> = {};
      for (const name of META_HEADERS) {
        const value = request.headers.get(name);
        if (value) customMetadata[name] = value;
      }
      // R2 can stream a body only when its length is known up front.
      const body = request.headers.has("content-length")
        ? request.body
        : await request.arrayBuffer();
      if (!body) return json({ error: "empty body" }, 400);
      await env.BUCKET.put(key, body, { customMetadata });
      return json({ urls: [`${team}/${match[1]}`] }, 202);
    }
    default:
      return json({ error: "method not allowed" }, 405);
  }
}

async function authorized(request: Request, token: string): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token || !given) return false;
  // Compare digests so the comparison is constant-time and length-independent.
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(given)),
    crypto.subtle.digest("SHA-256", encoder.encode(token)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function metaHeaders(object: Pick<R2Object, "customMetadata">): Headers {
  const headers = new Headers();
  for (const name of META_HEADERS) {
    const value = object.customMetadata?.[name];
    if (value) headers.set(name, value);
  }
  return headers;
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
