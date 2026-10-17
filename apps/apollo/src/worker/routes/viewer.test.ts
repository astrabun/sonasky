import { describe, expect, it } from "vitest";
import { readAcceptedWarnings, serializeAcceptedWarnings, viewerAliasPath } from "./viewer.ts";

const ALICE = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
const BOB = "did:web:bob.example.com";

describe("content warning cookie", () => {
  it("round-trips accepted DIDs", () => {
    const cookie = serializeAcceptedWarnings([ALICE, BOB]).split(";")[0];
    expect(readAcceptedWarnings(`other=1; ${cookie}`)).toEqual([ALICE, BOB]);
  });

  it("dedupes and keeps only the most recent DIDs", () => {
    const dids = Array.from({ length: 60 }, (_, i) => `did:web:site${i}.example.com`);
    const cookie = serializeAcceptedWarnings([...dids, dids[59]]).split(";")[0];
    expect(readAcceptedWarnings(cookie)).toEqual(dids.slice(10));
  });

  it("is a session cookie", () => {
    expect(serializeAcceptedWarnings([ALICE])).not.toMatch(/Max-Age|Expires/);
  });

  it("ignores missing or junk values", () => {
    expect(readAcceptedWarnings(undefined)).toEqual([]);
    expect(readAcceptedWarnings("sonasky_apollo_cw=")).toEqual([]);
    expect(readAcceptedWarnings(`sonasky_apollo_cw=nope|${ALICE}`)).toEqual([ALICE]);
  });
});

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
