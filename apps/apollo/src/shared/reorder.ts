/**
 * Returns a copy of `arr` with the item at `from` moved to index `to`
 * (splice semantics: `to` is the item's final position). Out-of-range indexes
 * leave the order unchanged.
 */
export function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr];
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
