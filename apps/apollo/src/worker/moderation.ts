/**
 * Moderation gate for serving a site. Checked on every viewer request (cached
 * briefly):
 *  - the Apollo admin blocklist (`APOLLO_ADMIN` KV, `block:<did>`)
 *  - the account's repo status on its PDS (takendown / suspended / deactivated)
 *  - labels from Bluesky's moderation service on the account and on the site's
 *    records, plus the AppView's view of the profile
 *  - the author's own self-labels on the site / page
 *
 * Takedown-class labels make the site unavailable; adult/graphic labels put it
 * behind a click-through warning. Labeler/AppView outages fail open (the repo
 * status check does not), so a moderation-service blip doesn't take every site
 * down.
 */

import { BSKY_LABELER_DID } from "../shared/moderation.ts";
import type { AppEnv } from "./env.ts";
import { getRepoStatus } from "./atproto/repo.ts";

const BSKY_MOD_SERVICE = "https://mod.bsky.app";
const BSKY_APPVIEW = "https://public.api.bsky.app";

/** Labels that mean "do not serve this". */
export const HIDE_LABELS = new Set(["!takedown", "!suspend", "!hide"]);
/** Labels that mean "warn before showing". */
export const WARN_LABELS = new Set(["porn", "sexual", "nudity", "graphic-media", "gore"]);

export type ModerationVerdict =
  | { kind: "ok" }
  | { kind: "warn"; labels: string[] }
  | { kind: "unavailable"; reason: string };

export interface LabelRow {
  src: string;
  uri: string;
  val: string;
  neg?: boolean;
  cts: string;
  exp?: string;
}

/** Collapse a label stream to the values currently in effect (negations and expiry applied). */
export function activeLabelValues(rows: LabelRow[], now = Date.now()): Set<string> {
  const latest = new Map<string, LabelRow>();
  for (const row of rows) {
    const key = `${row.src}|${row.uri}|${row.val}`;
    const prev = latest.get(key);
    if (!prev || prev.cts <= row.cts) latest.set(key, row);
  }
  const out = new Set<string>();
  for (const row of latest.values()) {
    if (row.neg) continue;
    if (row.exp && Date.parse(row.exp) <= now) continue;
    out.add(row.val);
  }
  return out;
}

async function bskyLabels(did: string): Promise<LabelRow[]> {
  const url = new URL("/xrpc/com.atproto.label.queryLabels", BSKY_MOD_SERVICE);
  url.searchParams.append("uriPatterns", did);
  url.searchParams.append("uriPatterns", `at://${did}/app.sonasky.apollo*`);
  url.searchParams.append("sources", BSKY_LABELER_DID);
  url.searchParams.set("limit", "250");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`queryLabels ${res.status}`);
  return ((await res.json()) as { labels?: LabelRow[] }).labels ?? [];
}

/**
 * Bluesky moderation labels on any of `subjects` (DIDs or exact record uris) in
 * one request, for checking many sites at once. Throws when the labeler can't
 * be reached.
 */
export async function bskyLabelsFor(subjects: string[]): Promise<LabelRow[]> {
  if (subjects.length === 0) return [];
  const url = new URL("/xrpc/com.atproto.label.queryLabels", BSKY_MOD_SERVICE);
  for (const s of subjects) url.searchParams.append("uriPatterns", s);
  url.searchParams.append("sources", BSKY_LABELER_DID);
  url.searchParams.set("limit", "250");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`queryLabels ${res.status}`);
  return ((await res.json()) as { labels?: LabelRow[] }).labels ?? [];
}

async function appviewProfileLabels(
  did: string,
): Promise<{ takendown: boolean; rows: LabelRow[] }> {
  const url = new URL("/xrpc/app.bsky.actor.getProfile", BSKY_APPVIEW);
  url.searchParams.set("actor", did);
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    // The AppView reports moderation-hidden accounts as 400s with these errors.
    const takendown =
      body.error === "AccountTakedown" || /takedown|suspended/i.test(body.message ?? "");
    if (takendown) return { takendown: true, rows: [] };
    throw new Error(`getProfile ${res.status}`);
  }
  const body = (await res.json()) as { labels?: LabelRow[] };
  return { takendown: false, rows: body.labels ?? [] };
}

async function computeVerdict(
  env: AppEnv,
  did: string,
  pds: string,
  selfLabels: string[],
): Promise<ModerationVerdict> {
  const blocked = await env.APOLLO_ADMIN.get(`block:${did}`);
  if (blocked !== null) return { kind: "unavailable", reason: "blocked" };

  const [status, labels, profile] = await Promise.all([
    getRepoStatus(pds, did),
    bskyLabels(did).catch((err) => {
      console.warn("moderation: queryLabels failed", err);
      return [] as LabelRow[];
    }),
    appviewProfileLabels(did).catch((err) => {
      console.warn("moderation: getProfile failed", err);
      return { takendown: false, rows: [] as LabelRow[] };
    }),
  ]);

  if (!status.active) return { kind: "unavailable", reason: status.status ?? "inactive" };
  if (profile.takendown) return { kind: "unavailable", reason: "takendown" };

  const values = activeLabelValues([...labels, ...profile.rows]);
  for (const v of values) {
    if (HIDE_LABELS.has(v)) return { kind: "unavailable", reason: v };
  }

  const warn = [...new Set([...values, ...selfLabels])].filter((v) => WARN_LABELS.has(v));
  return warn.length > 0 ? { kind: "warn", labels: warn } : { kind: "ok" };
}

/** Cached for 60s per DID (+ self-labels, which come from the records being served). */
export async function checkModeration(
  env: AppEnv,
  did: string,
  pds: string,
  selfLabels: string[] = [],
): Promise<ModerationVerdict> {
  const cacheKey = new Request(
    `https://apollo-internal.invalid/moderation/${encodeURIComponent(did)}?self=${encodeURIComponent(
      [...selfLabels].sort().join(","),
    )}`,
  );
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return (await cached.json()) as ModerationVerdict;

  const verdict = await computeVerdict(env, did, pds, selfLabels);
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(verdict), {
      headers: { "content-type": "application/json", "cache-control": "max-age=60" },
    }),
  );
  return verdict;
}

/** Is the DID on the Apollo admin blocklist? Used by write routes. */
export async function isBlocked(env: AppEnv, did: string): Promise<boolean> {
  return (await env.APOLLO_ADMIN.get(`block:${did}`)) !== null;
}
