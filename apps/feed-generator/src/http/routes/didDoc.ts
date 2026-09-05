import type { ServerResponse } from "node:http";
import { config } from "../../config.ts";
import { sendJson } from "../json.ts";

/** Serves the did:web document for this service at /.well-known/did.json. */
export function didDoc(res: ServerResponse): void {
  sendJson(res, 200, {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: config.serviceDid,
    service: [
      {
        id: "#bsky_fg",
        type: "BskyFeedGenerator",
        serviceEndpoint: `https://${config.serviceHostname}`,
      },
    ],
  });
}
