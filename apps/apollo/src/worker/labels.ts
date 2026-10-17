/**
 * Data for the labels block: the site owner's account labels from chosen
 * labelers (SonaSky, SonaSky Pokémon, anyone else), plus each labeler's name,
 * avatar and label display names from its `app.bsky.labeler.service` record.
 *
 * Labels come straight from each labeler's own endpoint (found in its DID
 * document) when it answers, so labelers the AppView doesn't index still work.
 * When the labeler is down, the AppView's copy is used instead. If both fail,
 * that labeler just shows no labels.
 */

import { fetchDidDoc } from "./atproto/identity.ts";
import { activeLabelValues, type LabelRow } from "./moderation.ts";
import { safeAvatar } from "./render/bsky.ts";

const APPVIEW = "https://public.api.bsky.app";
const LABELS_CACHE_SECONDS = 5 * 60;
const INFO_CACHE_SECONDS = 60 * 60;
/** queryLabels pages of 250; more than this many labels on one account is not a real profile. */
const MAX_PAGES = 4;

export interface LabelerInfo {
  did: string;
  handle?: string;
  name: string;
  avatar?: string;
  /** Label value -> display name. */
  names: Record<string, string>;
}

export interface LabelerLabels {
  labeler: LabelerInfo;
  /** Active label values (unordered; the renderer sorts by display name). */
  values: string[];
}

interface LocaleDef {
  lang: string;
  name: string;
}

interface LabelerView {
  creator: { did: string; handle: string; displayName?: string; avatar?: string };
  policies?: {
    labelValues?: string[];
    labelValueDefinitions?: { identifier: string; locales?: LocaleDef[] }[];
  };
}

async function cachedJson<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const cache = caches.default;
  const req = new Request(`https://apollo-internal.invalid/${key}`);
  const hit = await cache.match(req);
  if (hit) return (await hit.json()) as T;
  const value = await load();
  await cache.put(
    req,
    new Response(JSON.stringify(value), {
      headers: { "content-type": "application/json", "cache-control": `max-age=${ttl}` },
    }),
  );
  return value;
}

/** `#atproto_labeler` service endpoint from the labeler's DID document (https only). */
async function labelerEndpoint(did: string): Promise<string | null> {
  const doc = await fetchDidDoc(did);
  const svc = doc?.service?.find((s) => s.id === "#atproto_labeler" || s.type === "AtprotoLabeler");
  if (!svc) return null;
  try {
    const url = new URL(svc.serviceEndpoint);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** Display name for a label value: English, then any locale, then the raw value. */
export function labelDisplayName(identifier: string, locales: LocaleDef[] | undefined): string {
  const en = locales?.find((l) => l.lang === "en" || l.lang.startsWith("en-"));
  return (en ?? locales?.[0])?.name || identifier;
}

/** Labels `labelerDid` has on the account itself (not its records), negations/expiry applied. */
export function accountLabelValues(
  rows: LabelRow[],
  subjectDid: string,
  labelerDid: string,
): string[] {
  // Older SonaSky labels used other spellings ("Wolf", "red_fox"); normalize
  // before replaying so a later negation of either spelling still applies.
  const own = rows
    .filter((r) => r.src === labelerDid && r.uri === subjectDid)
    .map((r) => ({ ...r, val: r.val.toLowerCase().replaceAll("_", "-") }));
  return [...activeLabelValues(own)].filter((v) => !v.startsWith("!"));
}

async function queryLabelerDirect(
  endpoint: string,
  subjectDid: string,
  labelerDid: string,
): Promise<string[]> {
  const rows: LabelRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("/xrpc/com.atproto.label.queryLabels", endpoint);
    url.searchParams.set("uriPatterns", subjectDid);
    url.searchParams.set("sources", labelerDid);
    url.searchParams.set("limit", "250");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`queryLabels ${res.status}`);
    const body = (await res.json()) as { labels?: LabelRow[]; cursor?: string };
    rows.push(...(body.labels ?? []));
    if (!body.cursor || !body.labels?.length) break;
    cursor = body.cursor;
  }
  return accountLabelValues(rows, subjectDid, labelerDid);
}

/** The AppView's copy of the labeler's labels on the account (already current-state). */
async function queryLabelerViaAppview(subjectDid: string, labelerDid: string): Promise<string[]> {
  const url = new URL("/xrpc/app.bsky.actor.getProfile", APPVIEW);
  url.searchParams.set("actor", subjectDid);
  const res = await fetch(url, { headers: { "atproto-accept-labelers": labelerDid } });
  if (!res.ok) throw new Error(`getProfile ${res.status}`);
  const body = (await res.json()) as { labels?: LabelRow[] };
  return accountLabelValues(body.labels ?? [], subjectDid, labelerDid);
}

/** Ask the labeler itself; if it's unreachable or has no endpoint, fall back to the AppView. */
export async function fetchAccountLabels(
  subjectDid: string,
  labelerDid: string,
): Promise<string[]> {
  const endpoint = await labelerEndpoint(labelerDid);
  if (endpoint) {
    try {
      return await queryLabelerDirect(endpoint, subjectDid, labelerDid);
    } catch (err) {
      console.warn("labels: labeler unreachable, trying the AppView", labelerDid, err);
    }
  }
  return queryLabelerViaAppview(subjectDid, labelerDid);
}

function toInfo(view: LabelerView): LabelerInfo {
  const names: Record<string, string> = {};
  for (const def of view.policies?.labelValueDefinitions ?? []) {
    names[def.identifier] = labelDisplayName(def.identifier, def.locales);
  }
  return {
    did: view.creator.did,
    handle: view.creator.handle,
    name: view.creator.displayName || view.creator.handle,
    avatar: safeAvatar(view.creator.avatar),
    names,
  };
}

async function fetchLabelerInfo(did: string): Promise<LabelerInfo> {
  const url = new URL("/xrpc/app.bsky.labeler.getServices", APPVIEW);
  url.searchParams.set("dids", did);
  url.searchParams.set("detailed", "true");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`getServices ${res.status}`);
  const view = ((await res.json()) as { views?: LabelerView[] }).views?.[0];
  if (!view) return { did, name: did, names: {} };
  return toInfo(view);
}

/** Labels for each labeler, in the order given. Cached per (subject, labeler). */
export async function ownerLabels(
  subjectDid: string,
  labelerDids: string[],
): Promise<LabelerLabels[]> {
  return Promise.all(
    labelerDids.map(async (labelerDid) => {
      const [labeler, values] = await Promise.all([
        cachedJson(`labeler-info/${encodeURIComponent(labelerDid)}`, INFO_CACHE_SECONDS, () =>
          fetchLabelerInfo(labelerDid),
        ).catch((err: unknown) => {
          console.warn("labels: getServices failed", labelerDid, err);
          return { did: labelerDid, name: labelerDid, names: {} } as LabelerInfo;
        }),
        cachedJson(
          `labels/${encodeURIComponent(subjectDid)}/${encodeURIComponent(labelerDid)}`,
          LABELS_CACHE_SECONDS,
          () => fetchAccountLabels(subjectDid, labelerDid),
        ).catch((err: unknown) => {
          console.warn("labels: labeler and AppView both failed", labelerDid, err);
          return [] as string[];
        }),
      ]);
      return { labeler, values };
    }),
  );
}
