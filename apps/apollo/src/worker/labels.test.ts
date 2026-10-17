import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAccountLabels } from "./labels.ts";

const ME = "did:plc:abcdefghijklmnopqrstuvwx";
const LABELER = "did:plc:l3nbhdfelt5d26btksecetxu";
const ENDPOINT = "https://labeler.example.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** plc.directory + the labeler endpoint + the AppView, with the labeler answering `labelerStatus`. */
function stubNetwork(labelerStatus: number, service = true) {
  const calls: { url: string; headers: Headers }[] = [];
  vi.stubGlobal("fetch", async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: url.href, headers: new Headers(init?.headers) });
    if (url.hostname === "plc.directory") {
      return json({
        id: LABELER,
        service: service
          ? [{ id: "#atproto_labeler", type: "AtprotoLabeler", serviceEndpoint: ENDPOINT }]
          : [],
      });
    }
    if (url.origin === ENDPOINT) {
      if (labelerStatus !== 200) return new Response("error code: 525", { status: labelerStatus });
      return json({
        labels: [{ src: LABELER, uri: ME, val: "she", cts: "2026-01-01T00:00:00.000Z" }],
      });
    }
    if (url.pathname === "/xrpc/app.bsky.actor.getProfile") {
      return json({
        did: ME,
        labels: [
          { src: LABELER, uri: ME, val: "they", cts: "2026-01-01T00:00:00.000Z" },
          {
            src: "did:plc:someoneelse0000000000000",
            uri: ME,
            val: "x",
            cts: "2026-01-01T00:00:00.000Z",
          },
        ],
      });
    }
    return new Response("not found", { status: 404 });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchAccountLabels", () => {
  it("uses the labeler's own endpoint when it answers", async () => {
    const calls = stubNetwork(200);
    expect(await fetchAccountLabels(ME, LABELER)).toEqual(["she"]);
    expect(calls.some((c) => c.url.includes("getProfile"))).toBe(false);
  });
  it("falls back to the AppView, asking for that labeler, when the labeler is down", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const calls = stubNetwork(525);
    expect(await fetchAccountLabels(ME, LABELER)).toEqual(["they"]);
    const appview = calls.find((c) => c.url.includes("getProfile"));
    expect(appview?.headers.get("atproto-accept-labelers")).toBe(LABELER);
  });
  it("falls back to the AppView when the labeler has no endpoint", async () => {
    stubNetwork(200, false);
    expect(await fetchAccountLabels(ME, LABELER)).toEqual(["they"]);
  });
});
