# SonaSky Forms

A Cloudflare Worker that serves a React + Vite + Tailwind SPA _and_ its own API. SonaSky users
sign in with their Bluesky (AT Protocol) account, see the forms/surveys defined in this repo, and
submit responses.

Each submission is routed per-form to a Google Form (the Worker POSTs the answers, so the real
Google Form URL is never exposed to the browser) and/or a record written to the user's AT Proto
repo. A lightweight `app.sonasky.form.submission` marker record is always written to the user's repo
so the app can enforce single-response-per-user for forms that opt in.

This app is a Worker: it needs **no Dockerfile, no compose file, no Postgres/Redis**. All runtime
state lives in Cloudflare KV.

## Linking to a form

`${PUBLIC_URL}/f/<form-id>` opens that form directly. A signed-out visitor sees the sign-in prompt
and is returned to the form after authenticating (the return path is carried through the OAuth
`state`, restricted to same-origin paths). Good for announcement posts.

The Worker server-renders per-form OpenGraph/Twitter meta for `/` and `/f/<id>` (see
`src/worker/routes/shell.ts`) by rewriting the built `index.html` - so link unfurls on
Bluesky/Discord/Slack show the form's title + description, with the favicon as the card image.
This relies on `/` and `/f/*` being listed in `wrangler.jsonc` `assets.run_worker_first`.

## Layout

- `src/client/` - the React SPA (form list, section-at-a-time runner with conditional branching).
- `src/worker/` - the Hono app: OAuth routes, `/api/*`, submission handling.
- `src/forms/` - typed in-repo form definitions + registry. **Server-only** (they hold destination
  and env-var config); the client only ever receives sanitised DTOs from `/api/forms`.
- `src/forms/routing.ts` - pure section-graph helpers, imported by both the client and the worker.
- `src/shared/` - types shared between client and worker.
- `lexicons/` - record schema JSON, kept for documentation only (not loaded at runtime).

## Local development

The SPA (Vite) and the Worker (Wrangler) run as two processes:

```sh
cp .dev.vars.example .dev.vars
# set COOKIE_SECRET (openssl rand -hex 32) and GFORM_* ids; OAUTH_PRIVATE_KEY optional locally

pnpm forms:dev:worker     # from the repo root - `wrangler dev` on http://localhost:8787
pnpm forms:dev            # second terminal - Vite on http://localhost:5173, proxies /api + /oauth
```

Open the Vite URL for the UI; API/OAuth calls are proxied to the Worker. To exercise the Worker
alone (curl, no HMR) hit `http://127.0.0.1:8787` directly.

`wrangler dev` provisions local KV automatically; the `id`/`preview_id` values in `wrangler.jsonc`
are ignored in local mode.

**Testing sign-in locally:** a `localhost`/`127.0.0.1` `PUBLIC_URL` puts OAuth into atproto
"loopback client" mode - no hosted metadata, no tunnel needed, works straight against
`bsky.social`. The redirect comes back to `http://127.0.0.1:8787/oauth/callback`, so after
`pnpm -F @sonasky/app-forms build` open the app at **`http://127.0.0.1:8787`** (the Worker serves
the built SPA) rather than the Vite dev server. Production uses a normal discoverable client at
`${PUBLIC_URL}/client-metadata.json`.

## First deploy (one-time)

```sh
wrangler kv namespace create SSKYFORM_OAUTH_STATE
wrangler kv namespace create SSKYFORM_OAUTH_STATE --preview
wrangler kv namespace create SSKYFORM_OAUTH_SESSION
wrangler kv namespace create SSKYFORM_OAUTH_SESSION --preview
# paste the ids into wrangler.jsonc

wrangler secret put COOKIE_SECRET
wrangler secret put OAUTH_PRIVATE_KEY
wrangler secret put GFORM_TEST1
# set vars.PUBLIC_URL in wrangler.jsonc to the production origin
```

Merges to `main` that touch `apps/forms/**` deploy via `.github/workflows/deploy-forms.yml`.

## Adding a form

1. Add a file under `src/forms/definitions/` exporting a `FormDefinition`.
2. Register it in `src/forms/registry.ts`.
3. If it has a `google-form` destination, the Google Form **must be a single page - no section
   breaks** (this app owns section flow + branching; a flat `entry.*` POST only commits page 0 of a
   multi-page form). Add its `GFORM_*` secret (`wrangler secret put ...`) and to `.dev.vars`. Harvest
   the `entry.<id>` values via the Google Form's "Get pre-filled link", filling every field and
   reading the `entry.NNN` keys out of the generated URL.
4. Optional audit trail: set `submissionUriEntryId` on a `google-form` destination to also send the
   `at://` uri of the on-repo submission marker into that `entry.<id>` (add a matching short-answer
   question to the Google Form first).
5. Set `active: false` to retire a form - it then 404s and drops out of `/api/forms`.

## Notes

- Single-response-per-user is **best effort**: the check reads the user's PDS (which has no
  compare-and-set), so two near-simultaneous submits can both pass.
- Google Forms return an opaque `200` even when an `entry.<id>` is wrong - an unknown id is
  silently dropped. Verify new mappings against the form's response sheet.
