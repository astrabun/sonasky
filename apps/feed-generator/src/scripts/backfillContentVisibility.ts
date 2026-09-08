/**
 * backfillContentVisibility.ts
 *
 * Usage: pnpm feed-generator:backfill-content-visibility
 *
 */

import { closeDb, db } from "../db/index.ts";

const COLLECTION = "app.bsky.actor.contentVisibilityDeclaration";
const CONCURRENCY = 20;

interface DidDoc {
  service?: { id: string; type: string; serviceEndpoint: string }[];
}

const pdsEndpoint = (doc: DidDoc): string | null =>
  doc.service?.find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer")
    ?.serviceEndpoint ?? null;

/** Resolve a DID to its PDS base URL, or null if it can't be resolved. */
const resolvePds = async (did: string): Promise<string | null> => {
  try {
    if (did.startsWith("did:plc:")) {
      const res = await fetch(`https://plc.directory/${did}`);
      if (!res.ok) return null;
      return pdsEndpoint((await res.json()) as DidDoc);
    }
    if (did.startsWith("did:web:")) {
      const host = did.slice("did:web:".length).replaceAll(":", "/");
      const res = await fetch(`https://${host}/.well-known/did.json`);
      if (!res.ok) return null;
      return pdsEndpoint((await res.json()) as DidDoc);
    }
  } catch (err) {
    console.error(`resolve ${did} failed:`, err);
  }
  return null;
};

/** Whether `did` currently hides from algorithmic recommendations. */
const hidesFromRecs = async (did: string): Promise<boolean> => {
  const pds = await resolvePds(did);
  if (!pds) return false;
  const url = new URL(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.getRecord`);
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", COLLECTION);
  url.searchParams.set("rkey", "self");
  const res = await fetch(url);
  if (!res.ok) return false; // 400 RecordNotFound is the common case.
  const data = (await res.json()) as { value?: { hideFromAlgorithmicRecommendations?: unknown } };
  return data.value?.hideFromAlgorithmicRecommendations === true;
};

const main = async (): Promise<void> => {
  const rows = await db.selectFrom("account_label").select("did").distinct().execute();
  const dids = rows.map((r) => r.did);
  console.log(`Checking ${dids.length} labeled accounts...`);

  let optedOut = 0;
  for (let i = 0; i < dids.length; i += CONCURRENCY) {
    const batch = dids.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (did) => [did, await hidesFromRecs(did)] as const),
    );
    const hidden = results.filter(([, hide]) => hide).map(([did]) => did);
    if (hidden.length > 0) {
      await db
        .insertInto("opt_out")
        .values(hidden.map((did) => ({ did })))
        .onConflict((oc) => oc.column("did").doNothing())
        .execute();
      await db.deleteFrom("post").where("author_did", "in", hidden).execute();
      optedOut += hidden.length;
      for (const did of hidden) console.log(`  opted out: ${did}`);
    }
    console.log(`  ${Math.min(i + CONCURRENCY, dids.length)}/${dids.length}`);
  }

  console.log(`Done. ${optedOut} account(s) opted out.`);
};

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
