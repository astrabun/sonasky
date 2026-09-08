import "./patch-request.ts";
import { Hono } from "hono";
import type { AppEnv } from "./env.ts";
import { oauthRoutes } from "./oauth/routes.ts";
import { formsRoutes } from "./routes/forms.ts";
import { meRoutes } from "./routes/me.ts";
import { shellRoutes } from "./routes/shell.ts";
import { submitRoutes } from "./routes/submit.ts";

const app = new Hono<{ Bindings: AppEnv }>();

app.route("/", oauthRoutes);
app.route("/", meRoutes);
app.route("/", formsRoutes);
app.route("/", submitRoutes);
app.route("/", shellRoutes);

app.onError((err, c) => {
  console.error("unhandled error", err);
  return c.json({ ok: false, error: "internal" }, 500);
});

// Anything not handled above is a client-side route: serve the SPA shell.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
