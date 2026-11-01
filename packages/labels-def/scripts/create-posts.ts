/**
 * Creates a Bluesky post (plus a reply-disabling threadgate) for every label
 * whose `post` is "FIXME", then writes the new rkey back into src/labels.ts.
 *
 * The file is rewritten after each label, so an interrupted run can simply be
 * re-run and will pick up where it left off.
 *
 * Env vars:
 *   PRIME_BSKY_USER / PRIME_BSKY_PASS - login + app password for the SonaSky account
 *   (BSKY_USER / BSKY_PASS take precedence if set)
 *
 * Usage:
 *   node scripts/create-posts.ts [--dry-run]
 */
import { readFile, writeFile } from "node:fs/promises";
import { SONASKY_DID } from "../src/const.ts";
import { labels } from "../src/labels.ts";

const LABELS_PATH = new URL("../src/labels.ts", import.meta.url);
const ENTRYWAY = "https://bsky.social";
const MAX_ATTEMPTS = 8;

const dryRun = process.argv.includes("--dry-run");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** POSTs to an XRPC endpoint, backing off on 429s, 5xx and network errors. */
const xrpc = async <T>(
  service: string,
  nsid: string,
  body: unknown,
  accessJwt?: string,
): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    let res: Response | undefined;
    try {
      res = await fetch(`${service}/xrpc/${nsid}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(accessJwt ? { authorization: `Bearer ${accessJwt}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (res.ok) return (await res.json()) as T;
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
    }

    const retryable = !res || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new Error(`${nsid} failed (${res?.status}): ${await res?.text()}`);
    }

    // Prefer the server's reset time (unix seconds) when rate limited.
    const reset = Number(res?.headers.get("ratelimit-reset"));
    const waitMs =
      res?.status === 429 && reset
        ? Math.max(reset * 1000 - Date.now(), 1000)
        : Math.min(1000 * 2 ** attempt, 60_000);
    console.warn(
      `  ${nsid} got ${res?.status ?? "network error"}, retrying in ${Math.ceil(waitMs / 1000)}s`,
    );
    await sleep(waitMs);
  }
};

const pending = Object.entries(labels).filter(([, label]) => label.post === "FIXME");
console.log(`${pending.length} label(s) with post "FIXME"`);

/** Matches existing posts: "Name\n// Category: X", or just "Name" when uncategorized. */
const postText = (key: string, label: (typeof labels)[string]) => {
  const name = label.locales.find((l) => l.lang === "en")?.name ?? key;
  return label.category?.en ? `${name}\n// Category: ${label.category.en}` : name;
};

if (dryRun) {
  for (const [key, label] of pending) {
    console.log(`  ${key}: ${JSON.stringify(postText(key, label))}`);
  }
  process.exit(0);
}

const identifier = process.env.BSKY_USER ?? process.env.PRIME_BSKY_USER;
const password = process.env.BSKY_PASS ?? process.env.PRIME_BSKY_PASS;
if (!identifier || !password) {
  throw new Error("Missing BSKY_USER/BSKY_PASS (or PRIME_BSKY_USER/PRIME_BSKY_PASS) env vars");
}

type Session = {
  did: string;
  accessJwt: string;
  didDoc?: { service?: { id: string; serviceEndpoint: string }[] };
};
const session = await xrpc<Session>(ENTRYWAY, "com.atproto.server.createSession", {
  identifier,
  password,
});
if (session.did !== SONASKY_DID) {
  throw new Error(`Logged in as ${session.did}, but label posts must live on ${SONASKY_DID}`);
}
const pds =
  session.didDoc?.service?.find((s) => s.id === "#atproto_pds")?.serviceEndpoint ?? ENTRYWAY;

for (const [key, label] of pending) {
  const text = postText(key, label);

  const post = await xrpc<{ uri: string }>(
    pds,
    "com.atproto.repo.createRecord",
    {
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text,
        langs: ["en"],
        createdAt: new Date().toISOString(),
      },
    },
    session.accessJwt,
  );
  const rkey = post.uri.split("/").pop()!;

  // Threadgate must share the post's rkey; empty `allow` disables all replies.
  await xrpc(
    pds,
    "com.atproto.repo.createRecord",
    {
      repo: session.did,
      collection: "app.bsky.feed.threadgate",
      rkey,
      record: {
        $type: "app.bsky.feed.threadgate",
        post: post.uri,
        allow: [],
        createdAt: new Date().toISOString(),
      },
    },
    session.accessJwt,
  );

  // Swap this label's FIXME for the new rkey (post is the first field of each entry).
  const source = await readFile(LABELS_PATH, "utf8");
  const quotedKey = /^[a-z_$][\w$]*$/i.test(key) ? `(?:${key}|"${key}")` : JSON.stringify(key);
  const pattern = new RegExp(
    `(^  ${quotedKey.replace(/[-.]/g, "\\$&")}: \\{\\n    post: )"FIXME"`,
    "m",
  );
  if (!pattern.test(source)) {
    throw new Error(
      `Created ${post.uri} but couldn't find "${key}" FIXME in labels.ts; add it by hand`,
    );
  }
  await writeFile(LABELS_PATH, source.replace(pattern, `$1"${rkey}"`));
  console.log(`  ${key} -> ${rkey}`);
}

console.log("Done");
