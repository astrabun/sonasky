# @sonasky/app-feed-generator

A Bluesky [custom feed generator](https://atproto.com/guides/custom-feed-tutorial)
that serves **one reverse-chronological feed per active SonaSky species label** - the feed
for label `X` is the recent posts authored by accounts that currently carry label `X` -
plus an **"All SonaSky Users"** feed of posts from any account with any SonaSky species
label, a **"SonaSky Trending"** feed of the same population ranked by recent engagement,
and a **"SonaSky Picks"** feed of recent posts ranked by how many labeled accounts have
liked or reposted them.

The feed catalog (record keys, `at://` URIs, `bsky.app` links) lives in
[`@sonasky/feeds-def`](../../packages/feeds-def) so front-ends can link to a label's feeds.
Setting `TRENDING_PER_SPECIES=true` also defines/serves a trending feed per species label.

## How it works

One process runs seven things:

1. **Label sync** - polls each realm's Ozone labeler `com.atproto.label.queryLabels`
   (`uriPatterns=*`) every 60s, keeping the `account_label` table and an in-memory DID set
   in sync, honoring `neg` retractions. Label values are normalized (`Red_Panda` ->
   `red-panda`) to match `@sonasky/labels-def` ids. Per-realm cursor in Redis
   (`feeds:labels:cursor:<realm>`). (The `subscribeLabels` websocket firehose on these Ozone
   instances is missing history, so polling is used instead.)
2. **Post stream consumer** - reads the main `app.bsky.feed.post` Jetstream firehose and
   stores every post whose author is a currently-labeled account. Cursor in Redis
   (`feeds:jetstream:cursor`). Only posts seen after an account is known to be labeled are
   captured (no historical backfill).
3. **Interaction stream consumer** - reads the `app.bsky.feed.like` and
   `app.bsky.feed.repost` Jetstream firehoses and stores every like/repost whose author is a
   currently-labeled account (row dropped when the like/repost is undone). Cursor in Redis
   (`feeds:jetstream:interactions:cursor`). Same "no historical backfill" caveat.
4. **Prune job** - hourly, drops `post` and `interaction` rows older than
   `POST_RETENTION_DAYS` (default 7).
5. **Trending refresh** - every 15 min, scores the last 24h of posts from labeled accounts
   (engagement / age falloff, counts pulled from the AppView `app.bsky.feed.getPosts`) and
   rebuilds the `trending:all` Redis sorted set the "SonaSky Trending" feed is served from
   (plus `trending:species:<label>` sets when `TRENDING_PER_SPECIES=true`). Tuning constants
   are at the top of [`src/consumers/trending.ts`](./src/consumers/trending.ts); the shared
   scoring/hydration helpers live in [`src/consumers/ranking.ts`](./src/consumers/ranking.ts).
6. **Picks refresh** - every 15 min, groups the last 24h of `interaction` rows by post,
   scores each post by its weighted count of distinct labeled likers/reposters (repost =
   2x like) with the same age falloff, and rebuilds the `interacted:all` sorted set the
   "SonaSky Picks" feed is served from. Constants at the top of
   [`src/consumers/interacted.ts`](./src/consumers/interacted.ts).
7. **HTTP server** - serves the XRPC endpoints:
   - `GET /.well-known/did.json` - the `did:web:<SERVICE_HOSTNAME>` document
   - `GET /xrpc/app.bsky.feed.describeFeedGenerator`
   - `GET /xrpc/app.bsky.feed.getFeedSkeleton?feed=<at-uri>&limit=&cursor=`

Feeds are non-personalized.

## Pinned posts

[`src/pinnedPosts.ts`](./src/pinnedPosts.ts) is a hand-maintained list of posts to pin into
feeds (edit + redeploy to change). Each entry:

```ts
{ uri: "at://did:plc:.../app.bsky.feed.post/xyz",
  feeds: ["rabbit"],   // feed selectors - omit or ["*"] = every feed
  position: 0 }         // 0-indexed slot from the top; default 0
```

`feeds` selectors: `"all"` (global reverse-chron), `"trending"` (global trending),
`"interacted"` (global "SonaSky Picks"), `"<labelId>"` (a species' reverse-chron feed),
`"<labelId>.trending"` (a species' trending feed), `"*.chrono"` / `"*.trending"` (every feed
of that kind), `"*"` (everything).

Pins are injected into the **first page only** (requests with no `cursor`), de-duplicated
from the organic results, and clamped into the visible page. Cursor continuity is preserved,
so no organic post is dropped or duplicated across pages. At least one organic slot is always
kept (pins beyond `limit - 1` are ignored).

The plan for having this here is mainly if I want to pin a feedback/announcement post.

## Data store

Postgres (w/ Kysely). Migrations live in `src/db/migrations/` and run automatically on
startup; run them standalone with `pnpm feed-generator:migrate`.

## Env

See [.env.example](./.env.example). For the compose stack the only DB knob is
`POSTGRES_PASSWORD` (generate with `openssl rand -hex 16`) - compose builds `DATABASE_URL`
from it and starts Postgres with the same value. Also `SERVICE_HOSTNAME`,
`CLOUDFLARE_TUNNEL_TOKEN`, `SONASKY_BSKY_USER` / `SONASKY_BSKY_PASS` (publisher account),
and one `{REALM}_OZONE_SERVICE_USER_DID` per realm in `@sonasky/labels-def`.
`DATABASE_URL` / `REDIS_URL` / `PORT` in `.env` are only for running locally without Docker.

## Publishing the feed records

After adding/removing labels in `@sonasky/labels-def`, publish the
`app.bsky.feed.generator` records (owned by the main SonaSky account). The record key is a
stable 16-hex-char hash of the label id - the raw ids can't be used because some species
names trip the PDS record-key slur filter. `getFeedSkeleton` maps the rkey back to a label.

```
pnpm feed-generator:publish      # idempotent create/update, preserves createdAt
pnpm feed-generator:unpublish    # deletes records whose rkey is no longer an active label
pnpm feed-generator:purge        # DESTRUCTIVE: deletes ALL feed records; prompts for the
                                 # account handle to confirm (--yes to skip). Wipes a test account.
```

CI (`.github/workflows/publish-feeds.yml`) runs `publish` on pushes to `main` that touch
`packages/labels-def/**` or `apps/feed-generator/**`.

## Deploy

Self-contained stack in [`docker-compose.yml`](./docker-compose.yml): the service plus its
own `postgres`, `redis`, and `cloudflared` sidecar. From this directory:

```
cp .env.example .env   # fill in the values
docker compose up -d --build
```

The tunnel ingress rule (`feeds.sonasky.app` --> `http://feed-generator:8080`) and its DNS
record are configured out-of-repo.
