import { describe, expect, it } from "vitest";
import { handle, type CacheEnv } from "./handler";

const TOKEN = "secret-token";
const BASE = "https://cache.test/v8/artifacts";

// Just enough of R2Bucket for the handler: bytes plus custom metadata per key.
function fakeBucket() {
  const store = new Map<string, { data: Uint8Array; customMetadata: Record<string, string> }>();
  const bucket = {
    store,
    async head(key: string) {
      const entry = store.get(key);
      return entry ? { customMetadata: entry.customMetadata, size: entry.data.length } : null;
    },
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        customMetadata: entry.customMetadata,
        size: entry.data.length,
        body: new Response(entry.data).body,
      };
    },
    async put(
      key: string,
      value: ReadableStream | ArrayBuffer,
      options: { customMetadata: Record<string, string> },
    ) {
      const data = new Uint8Array(await new Response(value).arrayBuffer());
      store.set(key, { data, customMetadata: options.customMetadata });
      return {};
    },
  };
  return bucket;
}

function setup() {
  const bucket = fakeBucket();
  const env = { BUCKET: bucket, TURBO_TOKEN: TOKEN } as unknown as CacheEnv;
  const call = (path: string, init: RequestInit & { token?: string | null } = {}) => {
    const { token = TOKEN, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (token !== null) headers.set("authorization", `Bearer ${token}`);
    return handle(new Request(`${BASE}${path}`, { ...rest, headers }), env);
  };
  return { bucket, call };
}

describe("turbo remote cache", () => {
  it("rejects requests without the right token", async () => {
    const { call } = setup();
    expect((await call("/status", { token: null })).status).toBe(401);
    expect((await call("/status", { token: "wrong" })).status).toBe(401);
    expect((await call("/status", { token: `${TOKEN}x` })).status).toBe(401);
  });

  it("reports caching as enabled", async () => {
    const { call } = setup();
    const res = await call("/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "enabled" });
  });

  it("round-trips an artifact with its metadata", async () => {
    const { bucket, call } = setup();
    const body = new Uint8Array([1, 2, 3, 4]);

    expect((await call("/abc123?slug=sonasky", { method: "HEAD" })).status).toBe(404);
    expect((await call("/abc123?slug=sonasky")).status).toBe(404);

    const put = await call("/abc123?slug=sonasky", {
      method: "PUT",
      body,
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(body.length),
        "x-artifact-duration": "4200",
        "x-artifact-tag": "sig",
      },
    });
    expect(put.status).toBe(202);
    expect([...bucket.store.keys()]).toEqual(["sonasky/abc123"]);

    const head = await call("/abc123?slug=sonasky", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("x-artifact-duration")).toBe("4200");

    const get = await call("/abc123?slug=sonasky");
    expect(get.status).toBe(200);
    expect(get.headers.get("x-artifact-tag")).toBe("sig");
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(body);
  });

  it("namespaces artifacts by team", async () => {
    const { call } = setup();
    await call("/abc123?teamId=team_a", { method: "PUT", body: "x" });
    expect((await call("/abc123?teamId=team_a")).status).toBe(200);
    expect((await call("/abc123?slug=other")).status).toBe(404);
  });

  it("rejects bad hashes, missing teams and unknown methods", async () => {
    const { call } = setup();
    expect((await call("/not-hex?slug=sonasky")).status).toBe(404);
    expect((await call("/..%2Fescape?slug=sonasky")).status).toBe(404);
    expect((await call("/abc123")).status).toBe(400);
    expect((await call("/abc123?slug=bad/team")).status).toBe(400);
    expect((await call("/abc123?slug=sonasky", { method: "DELETE" })).status).toBe(405);
  });

  it("accepts usage events", async () => {
    const { call } = setup();
    expect((await call("/events", { method: "POST", body: "[]" })).status).toBe(200);
  });
});
