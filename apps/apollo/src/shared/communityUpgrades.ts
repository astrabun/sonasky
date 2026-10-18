/**
 * Community blocks that graduated to official blocks. When a community block
 * from @sonasky/apollo-blocks is promoted, add its official block the normal
 * way, move its id to `GRADUATED_BLOCKS` there, and add a function here that
 * turns the old community fields into the new block. Pages that still have
 * the community version are upgraded wherever blocks are read.
 */

import type { Block } from "./records.ts";

export const COMMUNITY_UPGRADES: Readonly<
  Record<string, (fields: Record<string, unknown>) => Block>
> = {};

/** The official form of a graduated community block; any other block unchanged. */
export function upgradeBlock(block: Block): Block {
  if (block.$type !== "app.sonasky.apollo.defs#community") return block;
  const upgrade = COMMUNITY_UPGRADES[block.block];
  return upgrade ? upgrade(block.fields ?? {}) : block;
}
