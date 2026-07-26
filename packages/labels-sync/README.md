# @sonasky/labels-sync

Pushes the label definitions from [@sonasky/labels-def](../labels-def) up to each realm's Ozone labeler service record, so the labeler's live set stay in sync with the label definitions in this repo.

## Setup

```bash
cp .env.example .env
# fill in .env with real credentials per realm
```

Each realm defined in `@sonasky/labels-def` (currently `prime` and `pokemon`) needs its own `{REALM}_BSKY_USER`, `{REALM}_BSKY_PASS`, and `{REALM}_OZONE_SERVICE_USER_DID` in `.env`.

## Run

```bash
pnpm sync
```

Uses [dotenvx](https://dotenvx.com) to load `.env`, then runs `src/uploadLocalizationsToLabeler.ts`, which logs into each realm's Bluesky account and `putRecord`s an updated `app.bsky.labeler.service` record
containing that realm's `labelValues`/`labelValueDefinitions`.

Realms are skipped individually on error (e.g. missing credentials) rather than aborting the whole run, but the script exits non-zero if any realm failed.
