import "./patch-request.ts";
import { Hono } from "hono";
import { origin, type AppEnv } from "./env.ts";
import { oauthRoutes } from "./oauth/routes.ts";
import { staticPage } from "./render/pages.ts";
import { apiRoutes } from "./routes/api.ts";
import { outRoutes } from "./routes/out.ts";
import { usercontentRoutes } from "./routes/usercontent.ts";
import { viewerAliasPath, viewerRoutes } from "./routes/viewer.ts";

/** Editor host: SPA, API, OAuth, viewer shell, link interstitial. */
const apolloApp = new Hono<{ Bindings: AppEnv }>();
apolloApp.route("/", oauthRoutes);
apolloApp.route("/", apiRoutes);
apolloApp.route("/", outRoutes);
apolloApp.route("/", viewerRoutes);
apolloApp.onError((err, c) => {
  console.error("unhandled error", err);
  if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/oauth/")) {
    return c.json({ ok: false, error: "internal" }, 500);
  }
  return staticPage({
    title: "Something went wrong",
    status: 502,
    body: `<h1>Something went wrong</h1><p>We couldn't load this page right now. The account's server may be having trouble - try again in a moment.</p><div class="actions"><a class="btn btn-primary" href="/">Go to Apollo</a></div>`,
  });
});
// Anything not handled above is either a viewer alias (`/handle/...`,
// `/profile/handle/...`) or a client-side route / static asset.
apolloApp.all("*", (c) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    const alias = viewerAliasPath(c.req.path);
    if (alias) return c.redirect(`${alias}${new URL(c.req.url).search}`, 301);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

/** Usercontent host: rendered sites only. Nothing else is reachable there. */
const usercontentApp = new Hono<{ Bindings: AppEnv }>();
usercontentApp.route("/", usercontentRoutes);
usercontentApp.onError((err) => {
  console.error("usercontent error", err);
  return new Response("Something went wrong.", {
    status: 500,
    headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" },
  });
});

export default {
  fetch(request: Request, env: AppEnv, ctx: ExecutionContext): Response | Promise<Response> {
    const host = new URL(request.url).host;
    if (host === new URL(origin(env.USERCONTENT_URL)).host) {
      return usercontentApp.fetch(request, env, ctx);
    }
    return apolloApp.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<AppEnv>;
