import { describe, expect, it } from "vitest";
import { viewerAliasPath } from "./viewer.ts";

describe("viewerAliasPath", () => {
  it.each([
    ["/alice.bsky.social", "/@alice.bsky.social"],
    ["/Alice.Bsky.Social/about", "/@alice.bsky.social/about"],
    ["/alice.bsky.social/blog/hello", "/@alice.bsky.social/blog/hello"],
    ["/profile/alice.bsky.social", "/@alice.bsky.social"],
    ["/profile/alice.bsky.social/about", "/@alice.bsky.social/about"],
    ["/did:plc:aaaaaaaaaaaaaaaaaaaaaaaa", "/@did:plc:aaaaaaaaaaaaaaaaaaaaaaaa"],
    ["/profile/did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/about", "/@did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/about"],
    ["/did%3Aplc%3Aaaaaaaaaaaaaaaaaaaaaaaaa", "/@did:plc:aaaaaaaaaaaaaaaaaaaaaaaa"],
  ])("%s -> %s", (path, expected) => {
    expect(viewerAliasPath(path)).toBe(expected);
  });

  it.each([
    "/",
    "/edit",
    "/edit/pages",
    "/help",
    "/report",
    "/assets/index-abc.js",
    "/sonasky_favicon.png",
    "/robots.txt",
    "/client-metadata.json",
    "/profile",
    "/profile/not a handle",
    "/%E0%A4%A",
  ])("%s is not an alias", (path) => {
    expect(viewerAliasPath(path)).toBeNull();
  });
});
