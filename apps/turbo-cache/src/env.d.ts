// Secrets aren't in wrangler.jsonc, so `wrangler types` can't see them.
// Set with: pnpm -F @sonasky/app-turbo-cache exec wrangler secret put TURBO_TOKEN
interface Env {
  TURBO_TOKEN: string;
}
