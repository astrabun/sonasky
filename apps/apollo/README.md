# SonaSky Apollo

Simple web hosting from your Bluesky account, at `apollo.sonasky.app`. Users build small sites (link
pages, events, starter-pack sign-ups, portfolios, blogs) with a no-code block builder, or write
Markdown/HTML/CSS/JS if they want to. Everything is stored as `app.sonasky.apollo.*` records (and
blobs referenced by records) in the user's own repo. Apollo itself stores no content.

Apollo has no AI features. Templates, themes and blocks give people a starting point and they do
the making.

## Two hostnames, one Worker

| Host                                | Serves                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `PUBLIC_URL` (`apollo.sonasky.app`) | Editor SPA, `/api/*`, `/oauth/*`, viewer shell `/@handle/...`, `/out` interstitial |
| `USERCONTENT_URL` (separate domain) | Rendered user sites (`/r/...`), script records, media. Nothing else.               |

`src/worker/index.ts` routes by `Host`. The usercontent host must be a **different registrable
domain** (not a subdomain of sonasky.app) so user JS never shares an origin, cookies or "site" with
the editor's OAuth session.

### How a site is served safely

1. `apollo.sonasky.app/@alice.example/about` resolves the handle (verified both ways against the
   DID document), loads the site + page records from Alice's PDS, and runs the moderation gate
   (`src/worker/moderation.ts`). It returns a small shell: a top bar (attribution + **Report**), OG
   tags from the records, and `<iframe sandbox="allow-scripts">` pointing at the usercontent host.
2. The usercontent document (`src/worker/render/document.ts`) is assembled server-side. Author HTML
   (HTML pages, Markdown output, text blocks, layouts) goes through an `HTMLRewriter` allowlist
   sanitizer (`render/sanitize.ts`). JS only enters through `app.sonasky.apollo.script` records,
   which are loaded by URL.
3. The usercontent CSP (`render/csp.ts`) adds `sandbox allow-scripts` (opaque origin even when
   opened directly), allows scripts only from Apollo's bootstrap and the site's own script records,
   allows images/media only from the site's own media records, and sets `connect-src 'none'`,
   `form-action 'none'` and `frame-ancestors <PUBLIC_URL>`.
4. Links: `/_apollo/bootstrap.js` intercepts clicks and `postMessage`s them to the shell. The shell
   accepts messages only from its own iframe and only during a user click, and sends every link
   through `/out`. `/out` redirects straight to Apollo/Bluesky/SonaSky links (`src/shared/links.ts`)
   and shows a "you're leaving" interstitial for everything else. The shell's `frame-src` is pinned
   to that one site, so script can't navigate the frame anywhere else.

## Records

See `lexicons/` (documentation only. Records are written with `validate: false` and checked by
`src/worker/validate/records.ts`, which rebuilds each record from known fields and enforces the
byte caps in `src/shared/limits.ts`).

- `app.sonasky.apollo` / `self`: site metadata (title, description, OG, favicon, nav, theme,
  home page, self-labels)
- `app.sonasky.apollo.page` / `<slug>`: pages (blocks, Markdown or HTML)
- `app.sonasky.apollo.post` / `<slug>`: blog posts
- `app.sonasky.apollo.style` / `<slug>`: theme tokens + CSS (the site theme is rkey `theme`)
- `app.sonasky.apollo.script` / `<slug>`: JavaScript
- `app.sonasky.apollo.layout` / `<slug>`: HTML templates with `{{content}}` etc.
- `app.sonasky.apollo.media` / TID: an uploaded blob + alt text
- `app.sonasky.apollo.ring` / `<slug>`: a webring (name, index page content, ordered member DIDs).
  Lives in the owner's repo; owning one doesn't need a site
- `app.sonasky.apollo.ringMember` / `<hash of ring uri>`: a site's acceptance of a ring invite

References between records are same-repo rkeys only. Records stay small (<=100 KB JSON, <=64 KB page
body, <=32 KB CSS/JS/layout). Use more pages rather than bigger ones.

## Rings

A ring (webring) is two-sided: the owner's `ring` record lists a site, and the site's own repo has
a `ringMember` record pointing back at the ring. Only then is the site a member
(`src/worker/rings.ts`). Members' sites always render **Previous · Ring · Next** in the footer,
appended even after custom layouts, since showing it is the point of membership.

- The ring page is `/@owner/ring/<slug>`, rendered on the usercontent host like any site. It shows
  the owner's content, the members and a random-site button.
- Prev/next/random are redirects (`/@owner/ring/<slug>/{prev,next,random}`). Site renders never
  need the whole roster.
- The roster (members that have accepted, have a site and aren't blocked or taken down) is rebuilt
  from the repos and cached for 5 minutes, keyed to the ring record's cid.
- Invites are found through the [Constellation](https://constellation.microcosm.blue) backlink
  index (`.members[].did` on ring records). Every hit is re-checked against the real record.
  Owners can also send an invite link (`/edit/rings/join?ring=<at-uri>`).

## Themes

The theme picker's official and community themes come from
[`packages/apollo-themes`](../../packages/apollo-themes) (`@sonasky/apollo-themes`). Its README
explains how anyone can contribute a theme. Picking a theme copies its tokens into the site's
`app.sonasky.apollo.style` record (with `basedOn: <theme id>` for credit), so sites never depend on
the catalog at render time.

The Theme panel's **Export** produces either a community theme file (to contribute back) or the
full generated CSS (`src/shared/themeCss.ts`), for people who want to keep going in code.

**Google Fonts** are proxied by the usercontent host (`src/worker/fonts.ts`):
`/_apollo/fonts.css?family=...` fetches Google's CSS server-side and rewrites every font URL to
`/_apollo/font/...`, which proxies `fonts.gstatic.com` with a one-year immutable cache. Visitors'
browsers only contact Apollo, and the site CSP allows fonts and font CSS only from those two paths.

## Moderation

- Every page, post, site and the account itself can be reported from the viewer's **Report** link
  (`/report`). This sends `com.atproto.moderation.createReport` with a strongRef subject to
  Bluesky's moderation service (default) or SonaSky's. Visitors who only want to report can sign in
  with a report-only scope (`purpose=report`), which grants no repo access.
- On view: `!takedown` / `!suspend` / `!hide` labels (Bluesky labeler + AppView) or an inactive repo
  --> 451. Adult/graphic labels, including the author's self-labels --> click-through warning.
- Admin blocklist: `wrangler kv key put --binding APOLLO_ADMIN "block:<did>" "<reason>"` blocks
  both viewing and publishing.
- Uploads are sniffed by magic bytes (PNG/JPEG/GIF/WebP/AVIF/MP4/WebM only, no SVG) on upload
  **and** on serve, since records can be written by any client.

## Local development

```sh
cp .dev.vars.example .dev.vars           # set COOKIE_SECRET
pnpm apollo:build                        # the Worker serves the built SPA
pnpm apollo:dev:worker                   # wrangler dev on :8787
```

Open the editor at **`http://127.0.0.1:8787`**. Locally, `http://localhost:8787` is the usercontent
origin (`.dev.vars` `USERCONTENT_URL`). It's a different origin, so the iframe isolation, CSP and
link interstitial behave as they do in production. `127.0.0.1` also puts OAuth in atproto loopback
mode (no tunnel needed). Wrangler's "Ready on http://localhost:8787" (and its `[b]` shortcut)
points at the usercontent host, whose root just redirects to the editor.

For UI work with HMR, run `pnpm apollo:dev` (Vite on :5173, proxying the Worker routes) alongside the
Worker. Sign-in and the live viewer are easiest to test on `127.0.0.1:8787`.

`pnpm apollo:test` runs the unit tests (link classification, punycode, validators, sniffing, URL
rewriting).

## First deploy (one-time)

> I've done this, this is just a note-to-self for later when I inevitably forget what I did.

1. Register the usercontent domain, add it to Cloudflare, and set `vars.USERCONTENT_URL` in
   `wrangler.jsonc`. Add both hostnames as custom domains on the `sonasky-apollo` Worker.
2. KV and secrets:

   ```sh
   wrangler kv namespace create APOLLO_OAUTH_STATE
   wrangler kv namespace create APOLLO_OAUTH_SESSION
   wrangler kv namespace create APOLLO_ADMIN
   # paste the ids into wrangler.jsonc
   wrangler secret put COOKIE_SECRET
   wrangler secret put OAUTH_PRIVATE_KEY
   ```

3. Set the GitHub repo variable `APOLLO_DEPLOY_ENABLED=true`. Merges to `main` that touch
   `apps/apollo/**` then deploy via `.github/workflows/deploy-apollo.yml` (PRs always dry-run).
