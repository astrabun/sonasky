/**
 * Editor API (Apollo host only). Apart from the public Discover, stats and
 * like-count routes, every route needs a session; mutations also need a
 * same-origin `Origin` header, a session with the right scopes (Apollo's full
 * scopes, or the visitor scope for likes), a clean blocklist entry and write
 * budget. All record bodies pass through `validate/records.ts` before they
 * reach the PDS.
 */

import type { Agent } from "@atproto/api";
import { TID } from "@atproto/common-web";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import type {
  ApiError,
  DiscoverResponse,
  DiscoverSite,
  Entry,
  LikeStatusResponse,
  MediaEntry,
  MediaUploadResponse,
  MeResponse,
  PreviewRequest,
  PreviewResponse,
  RingDirectoryResponse,
  OwnedRing,
  PutResponse,
  ReportRequest,
  RingLookupResponse,
  RingRef,
  RingsResponse,
  SiteBundle,
  SiteDirectoryResponse,
  SiteLookupResponse,
  StatsResponse,
} from "../../shared/dto.ts";
import { LIMITS, utf8Bytes } from "../../shared/limits.ts";
import { BSKY_LABELER_DID, SONASKY_DID } from "../../shared/moderation.ts";
import {
  isApolloCollection,
  NSID_LAYOUT,
  NSID_LIKE,
  NSID_MEDIA,
  NSID_PAGE,
  NSID_POST,
  NSID_RING,
  NSID_RING_MEMBER,
  NSID_SCRIPT,
  NSID_SITE,
  NSID_STYLE,
  SITE_RKEY,
  SLUG_COLLECTIONS,
  type SlugCollection,
} from "../../shared/nsid.ts";
import type {
  LayoutRecord,
  LikeRecord,
  MediaRecord,
  PageRecord,
  PostRecord,
  RingMemberRecord,
  RingRecord,
  ScriptRecord,
  SiteRecord,
  StyleRecord,
} from "../../shared/records.ts";
import { DEFAULT_SITE_SORT, isSiteSort, paginate, sortSites } from "../../shared/siteDirectory.ts";
import { isSlug, RESERVED_PAGE_SLUGS } from "../../shared/slug.ts";
import { origin, type AppEnv } from "../env.ts";
import { discoverSite, featureable } from "../discover.ts";
import { likeCount, likeRkey, siteUri } from "../likes.ts";
import { ringDirectory } from "../ring-directory.ts";
import { noteLike, siteDirectory } from "../site-directory.ts";
import { isDid, resolveActor } from "../atproto/identity.ts";
import { getPublicRecord } from "../atproto/repo.ts";
import { isBlocked } from "../moderation.ts";
import {
  forgetRoster,
  loadRing,
  mapLimit,
  memberDids,
  membershipRkey,
  ringPageUrl,
  ringRef,
  ringRoster,
  ringsListing,
  siteRings,
} from "../rings.ts";
import { getSessionAgent, type SessionAgent } from "../oauth/session.ts";
import { renderSiteDocument } from "../render/document.ts";
import { getStats } from "../stats.ts";
import { ALLOWED_MEDIA, sniffMime } from "../validate/media.ts";
import {
  SLUG_VALIDATORS,
  parseRingUri,
  validateLayout,
  validateLike,
  validatePage,
  validatePost,
  validateRing,
  validateRingMember,
  validateSite,
  validateStyle,
  ValidationError,
} from "../validate/records.ts";

type Vars = { session: SessionAgent };
type Env = { Bindings: AppEnv; Variables: Vars };
type Ctx = Context<Env>;

export const apiRoutes = new Hono<Env>();

const MAX_PER_COLLECTION: Record<SlugCollection, number> = {
  [NSID_PAGE]: LIMITS.pagesPerSite,
  [NSID_POST]: LIMITS.postsPerSite,
  [NSID_STYLE]: LIMITS.stylesPerSite,
  [NSID_SCRIPT]: LIMITS.scriptsPerSite,
  [NSID_LAYOUT]: LIMITS.layoutsPerSite,
};

function fail(
  c: Ctx,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500,
  body: Omit<ApiError, "ok">,
) {
  return c.json<ApiError>({ ok: false, ...body }, status);
}

function siteUrlFor(env: AppEnv, did: string, handle?: string): string {
  return `${origin(env.PUBLIC_URL)}/@${handle ?? did}`;
}

async function handleOf(agent: Agent, did: string): Promise<string | undefined> {
  try {
    return (await agent.com.atproto.repo.describeRepo({ repo: did })).data.handle;
  } catch {
    return undefined;
  }
}

async function listAll<T>(agent: Agent, collection: string, max: number): Promise<Entry<T>[]> {
  const out: Entry<T>[] = [];
  let cursor: string | undefined;
  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: agent.assertDid,
      collection,
      limit: 100,
      cursor,
    });
    for (const r of res.data.records) {
      out.push({ rkey: r.uri.slice(r.uri.lastIndexOf("/") + 1), cid: r.cid, value: r.value as T });
    }
    cursor = res.data.records.length ? res.data.cursor : undefined;
  } while (cursor && out.length < max);
  return out;
}

async function getOwn<T>(agent: Agent, collection: string, rkey: string): Promise<Entry<T> | null> {
  try {
    const res = await agent.com.atproto.repo.getRecord({ repo: agent.assertDid, collection, rkey });
    return { rkey, cid: res.data.cid ?? "", value: res.data.value as T };
  } catch (err) {
    if ((err as { error?: string }).error === "RecordNotFound") return null;
    if ((err as { status?: number }).status === 400) return null;
    throw err;
  }
}

async function put(
  agent: Agent,
  collection: string,
  rkey: string,
  record: unknown,
): Promise<PutResponse> {
  const res = await agent.com.atproto.repo.putRecord({
    repo: agent.assertDid,
    collection,
    rkey,
    validate: false,
    record: record as Record<string, unknown>,
  });
  return { ok: true, uri: res.data.uri, cid: res.data.cid };
}

// Middleware

/** Any signed-in session (report-only sessions included). */
const requireSession: MiddlewareHandler<Env> = async (c, next) => {
  const session = await getSessionAgent(c);
  if (!session) return fail(c, 401, { error: "unauthenticated" });
  c.set("session", session);
  await next();
};

/** Same-origin check for state-changing requests (on top of SameSite=Lax cookies). */
const requireSameOrigin: MiddlewareHandler<Env> = async (c, next) => {
  if (c.req.method !== "GET" && c.req.header("origin") !== origin(c.env.PUBLIC_URL)) {
    return fail(c, 403, { error: "bad_origin" });
  }
  await next();
};

/** Editing: full scopes, not blocked, within the write budget. */
const requireEditor: MiddlewareHandler<Env> = async (c, next) => {
  const session = c.get("session");
  if (!session.scopesOk) return fail(c, 403, { error: "reauth_required" });
  if (await isBlocked(c.env, session.did)) {
    return fail(c, 403, { error: "blocked", message: "This account can't publish on Apollo." });
  }
  if (c.req.method !== "GET") {
    const { success } = await c.env.WRITE_LIMITER.limit({ key: session.did });
    if (!success) {
      return fail(c, 429, {
        error: "rate_limited",
        message: "Slow down a little and try again in a minute.",
      });
    }
  }
  await next();
};

/** Liking: a session that may write likes (visitor or full scope), not blocked, within rate limit. */
const requireLiker: MiddlewareHandler<Env> = async (c, next) => {
  const session = c.get("session");
  if (!session.canLike) return fail(c, 403, { error: "reauth_required" });
  if (await isBlocked(c.env, session.did)) {
    return fail(c, 403, { error: "blocked", message: "This account can't like sites on Apollo." });
  }
  const { success } = await c.env.WRITE_LIMITER.limit({ key: `like:${session.did}` });
  if (!success) {
    return fail(c, 429, {
      error: "rate_limited",
      message: "Slow down a little and try again in a minute.",
    });
  }
  await next();
};

apiRoutes.onError((err, c) => {
  if (err instanceof ValidationError) {
    return c.json<ApiError>(
      { ok: false, error: "invalid", field: err.field, message: err.message },
      400,
    );
  }
  console.error("api error", err);
  return c.json<ApiError>(
    { ok: false, error: "internal", message: "Something went wrong. Please try again." },
    500,
  );
});

// Session

/** Who is the caller? Never 401 - the client uses this to decide what to render. */
apiRoutes.get("/api/me", async (c) => {
  const session = await getSessionAgent(c);
  if (!session) return c.json<MeResponse>({ authenticated: false });
  const handle = await handleOf(session.agent, session.did);
  return c.json<MeResponse>({
    authenticated: true,
    did: session.did,
    handle,
    reauthRequired: !session.scopesOk,
    canLike: session.canLike,
    siteUrl: siteUrlFor(c.env, session.did, handle),
  });
});

/** Public: how many people have an Apollo site. */
apiRoutes.get("/api/stats", async (c) => {
  return c.json<StatsResponse>(await getStats(), 200, { "cache-control": "public, max-age=300" });
});

/** Public: one random site to feature. `?not=<did>` skips the one already on screen. */
apiRoutes.get("/api/discover", async (c) => {
  let site: DiscoverSite | null = null;
  try {
    site = await discoverSite(c.env, c.req.query("not"));
  } catch (err) {
    console.error("discover error", err);
  }
  return c.json<DiscoverResponse>({ site }, 200, { "cache-control": "no-store" });
});

/** Public: every listed ring with an active member. Sorting and search happen client-side. */
apiRoutes.get("/api/discover/rings", async (c) => {
  try {
    return c.json<RingDirectoryResponse>({ rings: await ringDirectory(c.env) }, 200, {
      "cache-control": "public, max-age=300",
    });
  } catch (err) {
    console.error("ring directory error", err);
    return c.json<RingDirectoryResponse>({ rings: null }, 200, { "cache-control": "no-store" });
  }
});

/** Public: one page of the site directory. `?sort=` (see SITE_SORTS) and 1-based `?page=`. */
apiRoutes.get("/api/discover/sites", async (c) => {
  const rawSort = c.req.query("sort");
  const sort = isSiteSort(rawSort) ? rawSort : DEFAULT_SITE_SORT;
  try {
    const directory = await siteDirectory(c.env);
    const sites = sortSites(directory.sites, sort);
    const { items, page, pages } = paginate(sites, Number(c.req.query("page") ?? 1));
    return c.json<SiteDirectoryResponse>(
      { sites: items, page, pages, total: sites.length, pending: directory.pending },
      200,
      // Short: like counts (and so the "most liked" order) change within a few
      // minutes. Not at all while the index is still filling in.
      { "cache-control": directory.pending > 0 ? "no-store" : "public, max-age=30" },
    );
  } catch (err) {
    console.error("site directory error", err);
    return c.json<SiteDirectoryResponse>(
      { sites: null, page: 1, pages: 1, total: 0, pending: 0 },
      200,
      { "cache-control": "no-store" },
    );
  }
});

/** Public: does this handle (or DID) have a site we can show? */
apiRoutes.get("/api/discover/lookup", async (c) => {
  const raw = (c.req.query("actor") ?? "").trim().replace(/^@/, "");
  const actor = isDid(raw) ? raw : raw.toLowerCase();
  const headers = { "cache-control": "public, max-age=60" };
  const identity = actor
    ? await resolveActor(actor, c.env.HANDLE_RESOLVER_URL ?? "https://bsky.social")
    : null;
  if (!identity)
    return c.json<SiteLookupResponse>({ site: null, reason: "not_found" }, 200, headers);
  const handle = identity.handle ? { handle: identity.handle } : {};
  const found = await featureable(c.env, identity.did, identity);
  if (found) return c.json<SiteLookupResponse>({ site: found.card, ...handle }, 200, headers);
  const record = await getPublicRecord<SiteRecord>(
    identity.pds,
    identity.did,
    NSID_SITE,
    SITE_RKEY,
  ).catch(() => null);
  const reason = record?.value?.$type === NSID_SITE ? "unavailable" : "no_site";
  return c.json<SiteLookupResponse>({ site: null, reason, ...handle }, 200, headers);
});

// Likes

function siteDidFrom(value: unknown): string {
  if (typeof value !== "string" || !isDid(value)) {
    throw new ValidationError("site", "That isn't a valid site.");
  }
  return value;
}

/** Public: a site's like count, and whether the caller likes it. */
apiRoutes.get("/api/likes", async (c) => {
  const site = siteDidFrom(c.req.query("site"));
  const session = await getSessionAgent(c);
  const [count, liked] = await Promise.all([
    likeCount(site).then((n) => n ?? 0),
    session?.canLike
      ? likeRkey(site).then(async (rkey) => {
          const own = await getOwn<LikeRecord>(session.agent, NSID_LIKE, rkey);
          return own?.value.subject === siteUri(site);
        })
      : false,
  ]);
  return c.json<LikeStatusResponse>({ count, liked }, 200, { "cache-control": "no-store" });
});

apiRoutes.post("/api/likes", requireSession, requireSameOrigin, requireLiker, async (c) => {
  const { agent } = c.get("session");
  const body = (await c.req.json()) as { site?: unknown };
  const site = siteDidFrom(body.site);
  const owner = await resolveActor(site, c.env.HANDLE_RESOLVER_URL ?? "https://bsky.social");
  const record = owner
    ? await getPublicRecord<SiteRecord>(owner.pds, site, NSID_SITE, SITE_RKEY).catch(() => null)
    : null;
  if (record?.value?.$type !== NSID_SITE || (await isBlocked(c.env, site))) {
    return fail(c, 404, { error: "not_found", message: "This site doesn't exist." });
  }
  const like = validateLike({ subject: siteUri(site), createdAt: new Date().toISOString() });
  const rkey = await likeRkey(site);
  const existing = await getOwn<LikeRecord>(agent, NSID_LIKE, rkey);
  const res = await put(agent, NSID_LIKE, rkey, like);
  if (!existing) await noteLike(site, 1);
  return c.json<PutResponse>(res);
});

apiRoutes.delete("/api/likes", requireSession, requireSameOrigin, requireLiker, async (c) => {
  const { agent, did } = c.get("session");
  const site = siteDidFrom(c.req.query("site"));
  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: NSID_LIKE,
    rkey: await likeRkey(site),
  });
  await noteLike(site, -1);
  return c.json({ ok: true });
});

// Site bundle

apiRoutes.get("/api/site", requireSession, requireEditor, async (c) => {
  const { agent, did } = c.get("session");
  const uc = origin(c.env.USERCONTENT_URL);
  const [handle, site, pages, posts, styles, scripts, layouts, media] = await Promise.all([
    handleOf(agent, did),
    getOwn<SiteRecord>(agent, NSID_SITE, SITE_RKEY),
    listAll<PageRecord>(agent, NSID_PAGE, LIMITS.pagesPerSite),
    listAll<PostRecord>(agent, NSID_POST, LIMITS.postsPerSite),
    listAll<StyleRecord>(agent, NSID_STYLE, LIMITS.stylesPerSite),
    listAll<ScriptRecord>(agent, NSID_SCRIPT, LIMITS.scriptsPerSite),
    listAll<LayoutRecord>(agent, NSID_LAYOUT, LIMITS.layoutsPerSite),
    listAll<MediaRecord>(agent, NSID_MEDIA, 1000),
  ]);
  return c.json<SiteBundle>({
    did,
    handle,
    siteUrl: siteUrlFor(c.env, did, handle),
    usercontentOrigin: uc,
    site,
    pages,
    posts,
    styles,
    scripts,
    layouts,
    media: media.map((m): MediaEntry => ({ ...m, url: `${uc}/m/${did}/${m.rkey}` })),
  });
});

apiRoutes.put("/api/site", requireSession, requireSameOrigin, requireEditor, async (c) => {
  const { agent } = c.get("session");
  const record = validateSite(await c.req.json());
  return c.json<PutResponse>(await put(agent, NSID_SITE, SITE_RKEY, record));
});

/** Remove the whole site: the site record and every Apollo record in the repo. */
apiRoutes.delete("/api/site", requireSession, requireSameOrigin, requireEditor, async (c) => {
  const { agent } = c.get("session");
  const targets: { collection: string; rkey: string }[] = [];
  // Ring memberships go with the site (a ring needs a site to link to); rings
  // this account owns are kept.
  for (const collection of [...SLUG_COLLECTIONS, NSID_MEDIA, NSID_RING_MEMBER]) {
    for (const e of await listAll(agent, collection, 2000))
      targets.push({ collection, rkey: e.rkey });
  }
  targets.push({ collection: NSID_SITE, rkey: SITE_RKEY });
  // Batched so a big site stays well under the Worker's subrequest budget.
  for (let i = 0; i < targets.length; i += 100) {
    await agent.com.atproto.repo.applyWrites({
      repo: agent.assertDid,
      validate: false,
      writes: targets.slice(i, i + 100).map((t) => ({
        $type: "com.atproto.repo.applyWrites#delete" as const,
        collection: t.collection,
        rkey: t.rkey,
      })),
    });
  }
  return c.json({ ok: true });
});

// Pages, posts, styles, scripts, layouts

function slugCollection(value: string): SlugCollection | null {
  return (SLUG_COLLECTIONS as readonly string[]).includes(value) ? (value as SlugCollection) : null;
}

apiRoutes.put(
  "/api/records/:collection/:rkey",
  requireSession,
  requireSameOrigin,
  requireEditor,
  async (c) => {
    const { agent } = c.get("session");
    const collection = slugCollection(c.req.param("collection"));
    const rkey = c.req.param("rkey");
    if (!collection) return fail(c, 404, { error: "not_found" });
    if (!isSlug(rkey)) {
      return fail(c, 400, {
        error: "invalid",
        field: "slug",
        message: "Use lowercase letters, numbers and dashes (up to 64 characters).",
      });
    }
    if (collection === NSID_PAGE && RESERVED_PAGE_SLUGS.has(rkey)) {
      return fail(c, 400, {
        error: "invalid",
        field: "slug",
        message: `"${rkey}" is reserved. Pick another name.`,
      });
    }

    const record = SLUG_VALIDATORS[collection](await c.req.json());

    const existing = await getOwn(agent, collection, rkey);
    if (!existing) {
      const max = MAX_PER_COLLECTION[collection];
      const count = (await listAll(agent, collection, max + 1)).length;
      if (count >= max) {
        return fail(c, 409, {
          error: "limit",
          message: `You've reached the limit of ${max} for this site.`,
        });
      }
    }
    return c.json<PutResponse>(await put(agent, collection, rkey, record));
  },
);

apiRoutes.delete(
  "/api/records/:collection/:rkey",
  requireSession,
  requireSameOrigin,
  requireEditor,
  async (c) => {
    const { agent } = c.get("session");
    const collection = c.req.param("collection");
    const rkey = c.req.param("rkey");
    if (!isApolloCollection(collection) || collection === NSID_SITE)
      return fail(c, 404, { error: "not_found" });
    await agent.com.atproto.repo.deleteRecord({ repo: agent.assertDid, collection, rkey });
    return c.json({ ok: true });
  },
);

// Media

apiRoutes.post("/api/media", requireSession, requireSameOrigin, requireEditor, async (c) => {
  const { agent, did } = c.get("session");
  const form = await c.req.formData();
  const file = form.get("file");
  const altField = form.get("alt");
  const alt = typeof altField === "string" ? altField.trim() : "";
  // A description is required unless the uploader explicitly opted out.
  const noAlt = !alt && form.get("noAlt") === "true";
  if (!(file instanceof File))
    return fail(c, 400, { error: "invalid", field: "file", message: "Choose a file." });
  if (utf8Bytes(alt) > LIMITS.altBytes) {
    return fail(c, 400, {
      error: "invalid",
      field: "alt",
      message: "The description is too long.",
    });
  }
  if (!alt && !noAlt) {
    return fail(c, 400, {
      error: "invalid",
      field: "alt",
      message: "Describe the file, or tick the box saying you're choosing not to.",
    });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) {
    return fail(c, 415, {
      error: "invalid",
      field: "file",
      message:
        "That file type isn't supported. Use PNG, JPEG, GIF, WebP or AVIF images, or MP4/WebM video.",
    });
  }
  if (bytes.byteLength > ALLOWED_MEDIA[mime]) {
    return fail(c, 413, {
      error: "invalid",
      field: "file",
      message: `That file is too big (max ${Math.floor(ALLOWED_MEDIA[mime] / 1_000_000)} MB).`,
    });
  }

  const uploaded = await agent.com.atproto.repo.uploadBlob(bytes, { encoding: mime });
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  const record: MediaRecord = {
    $type: NSID_MEDIA,
    file: uploaded.data.blob.toJSON() as MediaRecord["file"],
    alt,
    ...(noAlt ? { noAlt: true } : {}),
    ...(Number.isInteger(width) && width > 0 && width < 100_000 ? { width } : {}),
    ...(Number.isInteger(height) && height > 0 && height < 100_000 ? { height } : {}),
    createdAt: new Date().toISOString(),
  };
  const rkey = TID.nextStr();
  const res = await put(agent, NSID_MEDIA, rkey, record);
  return c.json<MediaUploadResponse>({
    ok: true,
    media: {
      rkey,
      cid: res.cid,
      value: record,
      url: `${origin(c.env.USERCONTENT_URL)}/m/${did}/${rkey}`,
    },
  });
});

apiRoutes.put("/api/media/:rkey", requireSession, requireSameOrigin, requireEditor, async (c) => {
  const { agent } = c.get("session");
  const rkey = c.req.param("rkey");
  const body = (await c.req.json()) as { alt?: unknown };
  if (typeof body.alt !== "string" || utf8Bytes(body.alt) > LIMITS.altBytes) {
    return fail(c, 400, { error: "invalid", field: "alt", message: "Alt text is too long." });
  }
  const existing = await getOwn<MediaRecord>(agent, NSID_MEDIA, rkey);
  if (!existing) return fail(c, 404, { error: "not_found" });
  const alt = body.alt.trim();
  if (!alt && !existing.value.noAlt) {
    return fail(c, 400, { error: "invalid", field: "alt", message: "Add a description." });
  }
  // Adding a description replaces an earlier "no description" choice.
  const { noAlt: _noAlt, ...rest } = existing.value;
  const record: MediaRecord = { ...rest, $type: NSID_MEDIA, alt, ...(alt ? {} : { noAlt: true }) };
  return c.json<PutResponse>(await put(agent, NSID_MEDIA, rkey, record));
});

// Preview

apiRoutes.post("/api/preview", requireSession, requireSameOrigin, requireEditor, async (c) => {
  const { agent, did } = c.get("session");
  const body = (await c.req.json()) as PreviewRequest;
  // Same validation as publishing, so the preview never shows something that can't be saved.
  const site = validateSite(body.site);
  const styles = (Array.isArray(body.styles) ? body.styles : [])
    .slice(0, LIMITS.stylesPerPage + 1)
    .map(validateStyle);
  const layout = body.layout ? validateLayout(body.layout) : undefined;
  const t = body.target;
  if (!t || !isSlug(t.slug)) throw new ValidationError("slug", "Not a valid page name.");
  const target =
    t.kind === "post"
      ? { kind: "post" as const, slug: t.slug, record: validatePost(t.record) }
      : { kind: "page" as const, slug: t.slug, record: validatePage(t.record) };

  const [handle, identity] = await Promise.all([
    handleOf(agent, did),
    resolveActor(did, c.env.HANDLE_RESOLVER_URL ?? "https://bsky.social"),
  ]);
  const rings = identity ? await siteRings(c.env, identity.pds, did) : [];
  const html = await renderSiteDocument(
    { did, actor: handle ?? did, site, target, styles, layout, scripts: [], rings },
    { publicOrigin: origin(c.env.PUBLIC_URL), usercontentOrigin: origin(c.env.USERCONTENT_URL) },
  );
  return c.json<PreviewResponse>({ ok: true, html });
});

// Rings

const isRingMember = (v: unknown): v is RingMemberRecord =>
  (v as RingMemberRecord | null)?.$type === NSID_RING_MEMBER &&
  typeof (v as RingMemberRecord).ring === "string";

function ringFromQuery(c: Ctx): { did: string; slug: string; uri: string } {
  const uri = c.req.query("ring");
  const ref = parseRingUri(uri);
  if (!ref) throw new ValidationError("ring", "That isn't a valid ring link.");
  return { ...ref, uri: uri as string };
}

async function hasOwnSite(agent: Agent): Promise<boolean> {
  return (await getOwn<SiteRecord>(agent, NSID_SITE, SITE_RKEY)) !== null;
}

/** Everything the Rings screen needs: owned rings, memberships and invites. */
apiRoutes.get("/api/rings", requireSession, requireEditor, async (c) => {
  const { agent, did } = c.get("session");
  const resolverUrl = c.env.HANDLE_RESOLVER_URL ?? "https://bsky.social";
  const [hasSite, ownedEntries, memberEntries, styles, listing] = await Promise.all([
    hasOwnSite(agent),
    listAll<RingRecord>(agent, NSID_RING, LIMITS.ringsPerAccount),
    listAll<RingMemberRecord>(agent, NSID_RING_MEMBER, LIMITS.ringsPerSite * 2),
    listAll<StyleRecord>(agent, NSID_STYLE, LIMITS.stylesPerSite),
    ringsListing(did).catch((err) => {
      console.warn("ring invites lookup failed", err);
      return null;
    }),
  ]);
  const self = await resolveActor(did, resolverUrl);

  const owned = await Promise.all(
    ownedEntries.map(async (entry): Promise<OwnedRing> => {
      const uri = `at://${did}/${NSID_RING}/${entry.rkey}`;
      const ring = self ? await loadRing(c.env, did, entry.rkey, self) : null;
      const listed = new Set(ring ? (await ringRoster(c.env, ring)).map((m) => m.did) : []);
      const members = await mapLimit(memberDids(entry.value), 6, async (memberDid) => {
        const identity = await resolveActor(memberDid, resolverUrl).catch(() => null);
        return {
          did: memberDid,
          ...(identity?.handle ? { handle: identity.handle } : {}),
          status: listed.has(memberDid) ? ("accepted" as const) : ("pending" as const),
        };
      });
      return { entry, uri, url: ringPageUrl(c.env, self?.handle ?? did, entry.rkey), members };
    }),
  );

  const memberships = (
    await Promise.all(
      memberEntries
        .filter((e) => isRingMember(e.value))
        .map(async (e) => {
          const ref = parseRingUri(e.value.ring);
          if (!ref) return null;
          const ring = await loadRing(c.env, ref.did, ref.slug).catch(() => null);
          if (!ring) {
            return {
              uri: e.value.ring,
              name: "A ring that no longer exists",
              url: "",
              ownerDid: ref.did,
              active: false,
            };
          }
          return { ...ringRef(c.env, ring), active: memberDids(ring.entry.value).includes(did) };
        }),
    )
  ).filter((m): m is RingRef & { active: boolean } => m !== null);

  const joined = new Set(memberships.map((m) => m.uri));
  const invites = (
    await Promise.all(
      (listing ?? []).map(async ({ ownerDid, slug }) => {
        const ring = await loadRing(c.env, ownerDid, slug).catch(() => null);
        if (!ring || joined.has(ring.uri) || !memberDids(ring.entry.value).includes(did)) {
          return null;
        }
        return ringRef(c.env, ring);
      }),
    )
  ).filter((r): r is RingRef => r !== null);

  return c.json<RingsResponse>({
    did,
    hasSite,
    owned,
    memberships,
    invites,
    styles: styles.map((s) => ({
      rkey: s.rkey,
      name: s.value.name,
      ...(s.value.tokens ? { tokens: s.value.tokens } : {}),
      ...(s.value.basedOn ? { basedOn: s.value.basedOn } : {}),
    })),
    invitesOk: listing !== null,
  });
});

apiRoutes.put("/api/rings/:slug", requireSession, requireSameOrigin, requireEditor, async (c) => {
  const { agent } = c.get("session");
  const slug = c.req.param("slug");
  if (!isSlug(slug)) {
    return fail(c, 400, {
      error: "invalid",
      field: "slug",
      message: "Use lowercase letters, numbers and dashes (up to 64 characters).",
    });
  }
  const record = validateRing(await c.req.json());
  if (!(await getOwn(agent, NSID_RING, slug))) {
    const count = (await listAll(agent, NSID_RING, LIMITS.ringsPerAccount + 1)).length;
    if (count >= LIMITS.ringsPerAccount) {
      return fail(c, 409, {
        error: "limit",
        message: `You can own up to ${LIMITS.ringsPerAccount} rings.`,
      });
    }
  }
  return c.json<PutResponse>(await put(agent, NSID_RING, slug, record));
});

apiRoutes.delete(
  "/api/rings/:slug",
  requireSession,
  requireSameOrigin,
  requireEditor,
  async (c) => {
    const { agent, did } = c.get("session");
    const slug = c.req.param("slug");
    if (!isSlug(slug)) return fail(c, 404, { error: "not_found" });
    await agent.com.atproto.repo.deleteRecord({ repo: did, collection: NSID_RING, rkey: slug });
    return c.json({ ok: true });
  },
);

/** A ring as seen by someone following an invite link. */
apiRoutes.get("/api/rings/lookup", requireSession, requireEditor, async (c) => {
  const { agent, did } = c.get("session");
  const ref = ringFromQuery(c);
  const ring = await loadRing(c.env, ref.did, ref.slug);
  if (!ring) return fail(c, 404, { error: "not_found", message: "This ring doesn't exist." });
  const [membership, hasSite] = await Promise.all([
    getOwn<RingMemberRecord>(agent, NSID_RING_MEMBER, await membershipRkey(ring.uri)),
    hasOwnSite(agent),
  ]);
  return c.json<RingLookupResponse>({
    ring: ringRef(c.env, ring),
    invited: memberDids(ring.entry.value).includes(did),
    joined: membership?.value.ring === ring.uri,
    hasSite,
  });
});

/** Accept an invite: write this account's side of the membership. */
apiRoutes.post(
  "/api/ring-memberships",
  requireSession,
  requireSameOrigin,
  requireEditor,
  async (c) => {
    const { agent, did } = c.get("session");
    const body = (await c.req.json()) as { ring?: unknown };
    const ref = parseRingUri(body.ring);
    if (!ref) throw new ValidationError("ring", "That isn't a valid ring link.");
    if (!(await hasOwnSite(agent))) {
      return fail(c, 409, {
        error: "invalid",
        field: "site",
        message: "Make your site first - rings link sites together.",
      });
    }
    const ring = await loadRing(c.env, ref.did, ref.slug);
    if (!ring) return fail(c, 404, { error: "not_found", message: "This ring doesn't exist." });
    if (!memberDids(ring.entry.value).includes(did)) {
      return fail(c, 403, {
        error: "invalid",
        field: "ring",
        message: "You haven't been invited to this ring. Ask its owner to add your site.",
      });
    }
    const rkey = await membershipRkey(ring.uri);
    if (!(await getOwn(agent, NSID_RING_MEMBER, rkey))) {
      const count = (await listAll(agent, NSID_RING_MEMBER, LIMITS.ringsPerSite + 1)).length;
      if (count >= LIMITS.ringsPerSite) {
        return fail(c, 409, {
          error: "limit",
          message: `A site can be in up to ${LIMITS.ringsPerSite} rings.`,
        });
      }
    }
    const record = validateRingMember({ ring: ring.uri, createdAt: new Date().toISOString() });
    const res = await put(agent, NSID_RING_MEMBER, rkey, record);
    await forgetRoster(ring.uri);
    return c.json<PutResponse>(res);
  },
);

apiRoutes.delete(
  "/api/ring-memberships",
  requireSession,
  requireSameOrigin,
  requireEditor,
  async (c) => {
    const { agent, did } = c.get("session");
    const ref = ringFromQuery(c);
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: NSID_RING_MEMBER,
      rkey: await membershipRkey(ref.uri),
    });
    await forgetRoster(ref.uri);
    return c.json({ ok: true });
  },
);

// Reporting (any signed-in session, including report-only sign-ins)

const REPORT_URI_RE =
  /^at:\/\/(did:[a-z]+:[a-zA-Z0-9._:%-]+)\/([a-zA-Z0-9.]+)\/([a-zA-Z0-9._~:-]{1,512})$/;
const DID_RE = /^did:(plc:[a-z2-7]{24}|web:[a-zA-Z0-9.-]+(%3A[0-9]+)?)$/;
const REASON_TYPE_RE =
  /^(com\.atproto\.moderation\.defs|tools\.ozone\.report\.defs)#[a-zA-Z]{1,64}$/;

apiRoutes.post("/api/report", requireSession, requireSameOrigin, async (c) => {
  const { agent, did } = c.get("session");
  const { success } = await c.env.WRITE_LIMITER.limit({ key: `report:${did}` });
  if (!success)
    return fail(c, 429, {
      error: "rate_limited",
      message: "Too many reports. Try again in a minute.",
    });

  const body = (await c.req.json()) as ReportRequest;
  if (typeof body.reasonType !== "string" || !REASON_TYPE_RE.test(body.reasonType)) {
    throw new ValidationError("reasonType", "Pick a reason.");
  }
  if (
    body.reason !== undefined &&
    (typeof body.reason !== "string" || utf8Bytes(body.reason) > 2000)
  ) {
    throw new ValidationError("reason", "Details are too long.");
  }
  const labelerDid = body.destination === "sonasky" ? SONASKY_DID : BSKY_LABELER_DID;

  let subject:
    | { $type: "com.atproto.repo.strongRef"; uri: string; cid: string }
    | { $type: "com.atproto.admin.defs#repoRef"; did: string };
  const s = body.subject as Record<string, unknown> | undefined;
  if (s && typeof s.uri === "string" && typeof s.cid === "string") {
    const m = REPORT_URI_RE.exec(s.uri);
    if (!m || !isApolloCollection(m[2]) || s.cid.length > 128) {
      throw new ValidationError("subject", "Only Apollo content can be reported here.");
    }
    subject = { $type: "com.atproto.repo.strongRef", uri: s.uri, cid: s.cid };
  } else if (s && typeof s.did === "string" && DID_RE.test(s.did)) {
    subject = { $type: "com.atproto.admin.defs#repoRef", did: s.did };
  } else {
    throw new ValidationError("subject", "Nothing to report.");
  }

  await agent.withProxy("atproto_labeler", labelerDid).com.atproto.moderation.createReport({
    reasonType: body.reasonType,
    reason: body.reason?.trim() || undefined,
    subject,
  });
  return c.json({ ok: true });
});
