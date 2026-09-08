import type { Agent } from "@atproto/api";
import { TID } from "@atproto/common-web";
import type { AnswerValue } from "../../forms/types.ts";
import { NSID_SUBMISSION } from "../../shared/nsid.ts";

/** Deterministic `at://` uri for a record the caller is about to write. */
export function recordUriFor(did: string, collection: string, rkey: string): string {
  return `at://${did}/${collection}/${rkey}`;
}

/** Every `formId` the caller already has a submission marker for. */
export async function listSubmittedFormIds(agent: Agent): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor: string | undefined;
  do {
    const res = await agent.com.atproto.repo.listRecords({
      repo: agent.assertDid,
      collection: NSID_SUBMISSION,
      limit: 100,
      cursor,
    });
    for (const rec of res.data.records) {
      const value = rec.value as { formId?: unknown };
      if (typeof value?.formId === "string") ids.add(value.formId);
    }
    cursor = res.data.cursor;
  } while (cursor);
  return ids;
}

/** Page through the caller's submission markers; true once one matches `formId`. */
export async function hasExistingSubmission(agent: Agent, formId: string): Promise<boolean> {
  return (await listSubmittedFormIds(agent)).has(formId);
}

export interface WriteResponseArgs {
  collection: string;
  formId: string;
  answers: Record<string, AnswerValue>;
  visitedSections: string[];
}

/** Write the full response record to the user's repo. Returns its at:// uri. */
export async function writeResponseRecord(
  agent: Agent,
  args: WriteResponseArgs,
): Promise<{ uri: string }> {
  const res = await agent.com.atproto.repo.putRecord({
    repo: agent.assertDid,
    collection: args.collection,
    rkey: TID.nextStr(),
    validate: false,
    record: {
      $type: args.collection,
      formId: args.formId,
      answers: args.answers,
      visitedSections: args.visitedSections,
      createdAt: new Date().toISOString(),
    },
  });
  return { uri: res.data.uri };
}

export interface WriteMarkerArgs {
  formId: string;
  submittedAt: string;
  responseUri?: string;
  /** Pre-allocated rkey so the marker's uri can be referenced before this write. */
  rkey?: string;
}

/** Write the lightweight dedup marker. Always the last write in a submission. */
export async function writeSubmissionMarker(
  agent: Agent,
  args: WriteMarkerArgs,
): Promise<{ uri: string }> {
  const res = await agent.com.atproto.repo.putRecord({
    repo: agent.assertDid,
    collection: NSID_SUBMISSION,
    rkey: args.rkey ?? TID.nextStr(),
    validate: false,
    record: {
      $type: NSID_SUBMISSION,
      formId: args.formId,
      submittedAt: args.submittedAt,
      createdAt: args.submittedAt,
      ...(args.responseUri ? { responseUri: args.responseUri } : {}),
    },
  });
  return { uri: res.data.uri };
}
