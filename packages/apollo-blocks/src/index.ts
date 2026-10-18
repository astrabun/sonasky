import { pullQuote } from "./community/pull-quote.ts";
import type { CommunityBlockDefinition } from "./types.ts";

export * from "./types.ts";
export * from "./fields.ts";
export * from "./css.ts";
export * from "./validate.ts";

/**
 * Blocks contributed by the community, shown under "Community blocks" in
 * Apollo's block menu. To add one, see README.md: add a file in
 * src/community/ and list it here (alphabetical by id).
 */
export const COMMUNITY_BLOCKS: readonly CommunityBlockDefinition[] = [pullQuote];

/**
 * Community blocks that became official Apollo blocks: id -> the official
 * block's `$type`. Pages that still have the community version are upgraded
 * when Apollo reads them, so ids listed here are never reused.
 */
export const GRADUATED_BLOCKS: Readonly<Record<string, string>> = {};

export function findCommunityBlock(id: string | undefined): CommunityBlockDefinition | undefined {
  return id ? COMMUNITY_BLOCKS.find((b) => b.id === id) : undefined;
}
