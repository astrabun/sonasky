# turbo-cache

A [Turborepo remote cache](https://turborepo.com/docs/core-concepts/remote-caching#self-hosting)
on a Cloudflare Worker, with artifacts stored in R2. Should fit in Cloudflare's free plan.

## Why

GitHub's `actions/cache` scopes entries to the ref that saved them: a cache written by a PR run can't
be read by the run on `main` after the merge. So every merge rebuilt what the PR had already built.

This cache is shared by every run that has the token. Turbo keys tasks on their inputs, not on commit
SHAs, so after a squash merge the run on `main` computes the same task hashes as the PR's last run and
replays `build`, `test`, `typecheck`, `oxlint` and `oxfmt:check` instead of running them.

If `main` moved before the merge, only the packages whose inputs changed miss the cache.

## First deploy

All commands run from the repo root.

1. **Create the bucket.** You may have to enable R2 in the Cloudflare dashboard first, which can ask
   for a payment method even on the free plan.

   ```sh
   pnpm -F @sonasky/app-turbo-cache exec wrangler r2 bucket create sonasky-turbo-cache
   ```

2. **Expire old artifacts** so the bucket stays under the free plan's 10 GB:

   ```sh
   pnpm -F @sonasky/app-turbo-cache exec wrangler r2 bucket lifecycle add sonasky-turbo-cache expire-30d --expire-days 30
   ```

3. **Generate a token and set it as the Worker's secret:**

   ```sh
   openssl rand -hex 32   # copy the output
   pnpm -F @sonasky/app-turbo-cache exec wrangler secret put TURBO_TOKEN
   ```

4. **Deploy:**

   ```sh
   pnpm -F @sonasky/app-turbo-cache run deploy
   ```

   Note the `https://sonasky-turbo-cache.<subdomain>.workers.dev` URL that it prints.

5. **Configure the repo**, under GitHub --> Settings --> Secrets and variables --> Actions:

   | Kind     | Name                         | Value                                            |
   | -------- | ---------------------------- | ------------------------------------------------ |
   | Variable | `TURBO_API`                  | the Worker URL from step 4                       |
   | Variable | `TURBO_TEAM`                 | `sonasky` (any slug; namespaces keys)            |
   | Secret   | `TURBO_TOKEN`                | the token from step 3                            |
   | Variable | `TURBO_CACHE_DEPLOY_ENABLED` | `true`, so later changes here deploy from `main` |

   Set the same three `TURBO_*` values on Forgejo to share the cache there too.

6. **Check it.** In the logs of the next CI run, turbo prints `• Remote caching enabled`.

## Local use (optional)

Turbo doesn't read `.env` files for its own settings. To use the shared cache from your machine, put the
settings in `.turbo/config.json` at the repo root. The `.turbo` folder is gitignored, so the token stays
local:

```json
{
  "apiurl": "https://sonasky-turbo-cache.<subdomain>.workers.dev",
  "teamslug": "sonasky",
  "token": "..."
}
```

Or, for a single shell session, export `TURBO_API`, `TURBO_TEAM` and `TURBO_TOKEN`. Exported variables
override the file.

## Behaviour without a token

Fork PRs don't get repo secrets. With no token, turbo prints `Remote caching disabled` and builds
locally, so forks can never write to the cache. If the Worker is unreachable, turbo warns and builds
locally too. Neither case fails CI.

## Free plan limits

| Resource            | Free allowance     | Usage                               |
| ------------------- | ------------------ | ----------------------------------- |
| Worker requests     | 100k / day         | a few per task per run              |
| Worker request body | 100 MB             | per artifact, so per task's `dist/` |
| R2 storage          | 10 GB              | capped by the 30-day lifecycle rule |
| R2 writes / reads   | 1M / 10M per month |                                     |
| R2 egress           | free               |                                     |

## Development

```sh
pnpm -F @sonasky/app-turbo-cache test
pnpm -F @sonasky/app-turbo-cache exec wrangler dev --var TURBO_TOKEN:localtest
```
