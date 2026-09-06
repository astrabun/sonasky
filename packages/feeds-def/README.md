# @sonasky/feeds-def

The canonical catalog of SonaSky custom feeds - record keys, `at://` URIs, and
`bsky.app` links - for every species label plus the two label-agnostic feeds.
Imported by `apps/feed-generator` (to serve/publish) and by front-ends like
`apps/label-browser` (to link to a label's feeds).

## API

```ts
import { getGlobalFeeds, getLabelFeeds, getLabelFeedsMap } from "@sonasky/feeds-def";

getGlobalFeeds();
//  { all: FeedRef, trending: FeedRef }

getLabelFeeds(); // default: no per-species trending
getLabelFeeds({ perSpeciesTrending: true });
//  [{ labelId, speciesName, feed: FeedRef, trendingFeed?: FeedRef }, ...]

getLabelFeedsMap({ perSpeciesTrending: true });
//  { [labelId]: LabelFeeds }
```

`FeedRef` = `{ rkey, atUri, bskyUrl, displayName, description }`. `bskyUrl` is
`https://bsky.app/profile/sonasky.app/feed/<rkey>`.

Only labels earned by liking a post get feeds (labels with no `post`, e.g.
`sonasky-ref-sheet-user`, are excluded).

## Generated data

`src/catalog.generated.ts` is produced by **`pnpm -F @sonasky/feeds-def gen`**
(also `pnpm feeds-def:gen` from the repo root). The record key is
`sha256(seed).slice(0, 16)` - hashed because raw label ids can't all be record
keys (some trip the PDS slur filter). Hashing runs once here, in Node, so the
shipped catalog is plain data that also loads in a browser bundle.

Re-run `gen` after changing `@sonasky/labels-def`. A pre-commit hook
(`lint-staged`) regenerates it automatically when `packages/labels-def/src/**` or
`packages/feeds-def/src/**` changes, and CI fails if it is stale.
