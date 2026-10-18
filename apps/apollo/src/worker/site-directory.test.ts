import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "./env.ts";
import { siteDirectory } from "./site-directory.ts";

/** Workers Free: fetches and Cache API calls share this per-request limit. */
const SUBREQUEST_LIMIT = 50;
const SITES = 17;

const did = (i: number) => `did:plc:${String.fromCharCode(97 + i).repeat(24)}`;
const handle = (i: number) => `site${i}.example.com`;
const DIDS = Array.from({ length: SITES }, (_, i) => did(i));

const env = {
  PUBLIC_URL: "https://apollo.test",
  HANDLE_RESOLVER_URL: "https://resolver.test",
  APOLLO_ADMIN: { get: async () => null },
} as unknown as AppEnv;

let subrequests = 0;
let store = new Map<string, string>();

/**
 * A fake network where every site exists and is clean, but handle checks take
 * the slowest path (DNS and well-known both miss), to count the worst case.
 */
function route(url: URL): Response {
  const p = url.pathname;
  if (url.hostname === "plc.directory") {
    const id = decodeURIComponent(p.slice(1));
    const i = DIDS.indexOf(id);
    return Response.json({
      id,
      alsoKnownAs: [`at://${handle(i)}`],
      service: [
        {
          id: "#atproto_pds",
          type: "AtprotoPersonalDataServer",
          serviceEndpoint: "https://pds.test",
        },
      ],
    });
  }
  if (url.hostname === "cloudflare-dns.com") return Response.json({});
  if (p === "/.well-known/atproto-did") return new Response("", { status: 404 });
  if (p === "/xrpc/com.atproto.identity.resolveHandle") {
    const i = Array.from({ length: SITES }, (_, n) => handle(n)).indexOf(
      url.searchParams.get("handle") ?? "",
    );
    return Response.json({ did: did(i) });
  }
  if (p === "/xrpc/com.atproto.sync.listReposByCollection") {
    return Response.json({ repos: DIDS.map((d) => ({ did: d })) });
  }
  if (p === "/xrpc/com.atproto.repo.getRecord") {
    const repo = url.searchParams.get("repo");
    const collection = url.searchParams.get("collection");
    const rkey = url.searchParams.get("rkey");
    const value =
      collection === "app.sonasky.apollo"
        ? {
            $type: collection,
            title: `Site ${repo}`,
            homePage: "home",
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-02T00:00:00.000Z",
          }
        : { $type: collection };
    return Response.json({ uri: `at://${repo}/${collection}/${rkey}`, cid: "bafy", value });
  }
  if (p === "/xrpc/com.atproto.sync.getRepoStatus") return Response.json({ active: true });
  if (p === "/links/count/distinct-dids") return Response.json({ total: 2 });
  if (p === "/links") {
    // One past post (2025-11-19) per site, via link cards.
    return Response.json({
      linking_records:
        url.searchParams.get("path") === ".embed.external.uri"
          ? [{ did: "did:plc:fan", collection: "app.bsky.feed.post", rkey: "3m5xyz2abcd22" }]
          : [],
    });
  }
  if (p === "/xrpc/app.bsky.actor.getProfiles") {
    return Response.json({
      profiles: url.searchParams.getAll("actors").map((d) => ({ did: d, handle: "x.test" })),
    });
  }
  if (p === "/xrpc/app.bsky.feed.getPosts") {
    return Response.json({
      posts: url.searchParams
        .getAll("uris")
        .map((uri) => ({ uri, indexedAt: "2025-11-19T10:07:05.000Z" })),
    });
  }
  if (p === "/xrpc/com.atproto.label.queryLabels") return Response.json({ labels: [] });
  throw new Error(`unexpected fetch ${url.toString()}`);
}

beforeEach(() => {
  subrequests = 0;
  store = new Map();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      subrequests++;
      return route(new URL(input instanceof Request ? input.url : String(input)));
    }),
  );
  vi.stubGlobal("caches", {
    default: {
      match: vi.fn(async (req: Request) => {
        subrequests++;
        const body = store.get(req.url);
        return body === undefined ? undefined : new Response(body);
      }),
      put: vi.fn(async (req: Request, res: Response) => {
        subrequests++;
        store.set(req.url, await res.text());
      }),
      delete: vi.fn(async (req: Request) => {
        subrequests++;
        return store.delete(req.url);
      }),
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("siteDirectory", () => {
  it("stays under the Workers Free subrequest limit on every request until the index is full", async () => {
    const counts: number[] = [];
    let result = { sites: [] as unknown[], pending: SITES };
    for (let i = 0; i < 20 && result.pending > 0; i++) {
      subrequests = 0;
      result = await siteDirectory(env);
      counts.push(subrequests);
    }
    expect(result.pending).toBe(0);
    expect(result.sites).toHaveLength(SITES);
    expect(Math.max(...counts)).toBeLessThanOrEqual(SUBREQUEST_LIMIT);
  });

  it("fills in the directory's fields from the batched lookups", async () => {
    let result = await siteDirectory(env);
    while (result.pending > 0) result = await siteDirectory(env);
    expect(result.sites[0]).toMatchObject({
      title: expect.stringMatching(/^Site did:plc:/),
      likes: 2,
      lastLinkedAt: "2025-11-19T10:07:05.000Z",
      createdAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("refreshes like counts within the budget once the index is warm", async () => {
    let result = await siteDirectory(env);
    while (result.pending > 0) result = await siteDirectory(env);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 3 * 60_000);
    subrequests = 0;
    await siteDirectory(env);
    expect(subrequests).toBeLessThanOrEqual(SUBREQUEST_LIMIT);
    vi.useRealTimers();
  });
});
