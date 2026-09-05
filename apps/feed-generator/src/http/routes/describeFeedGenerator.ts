import type { ServerResponse } from "node:http";
import { config } from "../../config.ts";
import { getServedFeeds } from "../../feeds.ts";
import { sendJson } from "../json.ts";

/** app.bsky.feed.describeFeedGenerator - lists every feed this service serves. */
export function describeFeedGenerator(res: ServerResponse): void {
  sendJson(res, 200, {
    did: config.serviceDid,
    feeds: getServedFeeds().map((feed) => ({ uri: feed.uri })),
  });
}
