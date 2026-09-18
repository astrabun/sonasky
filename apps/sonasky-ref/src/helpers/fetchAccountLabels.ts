import { getLabelerEndpoint } from "./getLabelerEndpoint";

interface QueriedLabel {
  src: string;
  uri: string;
  val: string;
  neg?: boolean;
  cts: string;
}

export interface AccountLabel {
  val: string;
  src: string;
}

const normalizeVal = (val: string): string => val.toLowerCase().replaceAll("_", "-");

const queryLabelsFromEndpoint = async (
  endpoint: string,
  subjectDid: string,
): Promise<QueriedLabel[]> => {
  const collected: QueriedLabel[] = [];
  let cursor: string | undefined;

  for (;;) {
    const url = new URL(`${endpoint}/xrpc/com.atproto.label.queryLabels`);
    url.searchParams.set("uriPatterns", subjectDid);
    url.searchParams.set("limit", "250");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url);
    if (!res.ok) {
      return collected;
    }
    const data = (await res.json()) as { cursor?: string; labels: QueriedLabel[] };
    collected.push(...data.labels);

    if (!data.cursor || data.cursor === cursor || data.labels.length === 0) {
      break;
    }
    cursor = data.cursor;
  }

  return collected;
};

/**
 * Resolves the current (non-negated) labels a set of labelers have applied to
 * an account, by replaying each labeler's raw `queryLabels` events in time
 * order (queryLabels returns history, not current state).
 */
export const fetchAccountLabels = async (
  labelerDids: string[],
  subjectDid: string,
): Promise<AccountLabel[]> => {
  const endpoints = await Promise.all(labelerDids.map((did) => getLabelerEndpoint(did)));

  const events = (
    await Promise.all(
      endpoints
        .filter((endpoint): endpoint is string => Boolean(endpoint))
        .map((endpoint) => queryLabelsFromEndpoint(endpoint, subjectDid)),
    )
  )
    .flat()
    .filter((label) => label.uri === subjectDid);

  events.sort((a, b) => (a.cts < b.cts ? -1 : a.cts > b.cts ? 1 : 0));

  const active = new Map<string, AccountLabel>();
  for (const event of events) {
    const key = `${event.src}:${normalizeVal(event.val)}`;
    if (event.neg) {
      active.delete(key);
    } else {
      active.set(key, { val: normalizeVal(event.val), src: event.src });
    }
  }

  return [...active.values()];
};
