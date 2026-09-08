import { Hono, type Context } from "hono";
import type { AppEnv } from "../env.ts";
import { getForm } from "../../forms/registry.ts";

/**
 * Serves the SPA shell for navigations that need per-page OpenGraph tags (`/`
 * and `/f/<id>`). Fetches the built `index.html` from the assets binding and
 * rewrites the `<title>` + og/twitter meta before returning. All other SPA
 * paths fall through to the static-assets SPA fallback unchanged.
 *
 * Requires `/` and `/f/*` in `wrangler.jsonc` `assets.run_worker_first`.
 */
export const shellRoutes = new Hono<{ Bindings: AppEnv }>();

const GENERIC = {
  title: "SonaSky Forms",
  description: "Fill out SonaSky forms and surveys with your Bluesky account.",
};

interface ShellMeta {
  title: string;
  description: string;
  url: string;
}

async function renderShell(c: Context<{ Bindings: AppEnv }>, meta: ShellMeta): Promise<Response> {
  const origin = c.env.PUBLIC_URL.replace(/\/+$/, "");
  const image = `${origin}/sonasky_favicon.png`;
  const assetRes = await c.env.ASSETS.fetch(new URL("/index.html", c.req.url));

  const content: Record<string, string> = {
    'meta[name="description"]': meta.description,
    'meta[property="og:title"]': meta.title,
    'meta[property="og:description"]': meta.description,
    'meta[property="og:url"]': meta.url,
    'meta[property="og:image"]': image,
    'meta[name="twitter:title"]': meta.title,
    'meta[name="twitter:description"]': meta.description,
  };

  let rewriter = new HTMLRewriter().on("title", {
    element(el) {
      el.setInnerContent(meta.title);
    },
  });
  for (const [selector, value] of Object.entries(content)) {
    rewriter = rewriter.on(selector, {
      element(el) {
        el.setAttribute("content", value);
      },
    });
  }

  const out = rewriter.transform(assetRes);
  return new Response(out.body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
}

shellRoutes.get("/", (c) =>
  renderShell(c, { ...GENERIC, url: `${c.env.PUBLIC_URL.replace(/\/+$/, "")}/` }),
);

shellRoutes.get("/f/:id", (c) => {
  const id = c.req.param("id");
  const form = getForm(id);
  const meta =
    form && form.active
      ? {
          title: `${form.title} - SonaSky Forms`,
          description: form.description ?? GENERIC.description,
        }
      : GENERIC;
  return renderShell(c, { ...meta, url: `${c.env.PUBLIC_URL.replace(/\/+$/, "")}/f/${id}` });
});
