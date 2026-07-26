import type { LabelDef } from "./types.ts";

/**
 * Excludes labels that were requested but never used (NOT_USED_AFTER_LONG_TIME)
 * or that were removed for a specific reason (any REMOVAL_DUE_TO_* flag).
 */
export function isActiveLabel(def: LabelDef): boolean {
  if (!def.flags) return true;
  if (def.flags.includes("NOT_USED_AFTER_LONG_TIME")) return false;
  if (def.flags.some((flag) => flag.includes("REMOVAL_DUE_TO_"))) return false;
  return true;
}
