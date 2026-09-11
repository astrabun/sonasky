// Mounted at ref.sonasky.app/firehose* via a Worker route, but the built
// assets live at the site root (dist/), matching the app's own base path
// ("/firehose/") for its script/asset URLs. Strip the prefix so the ASSETS
// binding's path-to-file lookup lines up with where Vite actually wrote them.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    url.pathname = url.pathname.replace(/^\/firehose/, "") || "/";
    return env.ASSETS.fetch(new Request(url, request));
  },
};
