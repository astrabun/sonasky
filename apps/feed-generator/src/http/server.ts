import { createServer, type Server } from "node:http";
import { config } from "../config.ts";
import { describeFeedGenerator } from "./routes/describeFeedGenerator.ts";
import { didDoc } from "./routes/didDoc.ts";
import { getFeedSkeleton } from "./routes/getFeedSkeleton.ts";
import { sendError } from "./json.ts";

/** Starts the XRPC HTTP server. Resolves once it is listening. */
export function startHttpServer(): Promise<Server> {
  const server = createServer((req, res) => {
    res.setHeader("access-control-allow-origin", "*");

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? config.serviceHostname}`);

    const done = (p: void | Promise<void>) => {
      Promise.resolve(p).catch((err) => {
        console.error(`Error handling ${url.pathname}:`, err);
        if (!res.headersSent) sendError(res, 500, "InternalServerError");
      });
    };

    switch (url.pathname) {
      case "/.well-known/did.json":
        return done(didDoc(res));
      case "/xrpc/app.bsky.feed.describeFeedGenerator":
        return done(describeFeedGenerator(res));
      case "/xrpc/app.bsky.feed.getFeedSkeleton":
        return done(getFeedSkeleton(res, url.searchParams));
      case "/health":
        res.writeHead(200, { "content-type": "text/plain" }).end("ok");
        return;
      default:
        sendError(res, 404, "NotFound", `Unknown route ${url.pathname}`);
        return;
    }
  });

  return new Promise((resolve) => {
    server.listen(config.port, () => {
      console.log(`feed-generator listening on port ${config.port}`);
      resolve(server);
    });
  });
}
