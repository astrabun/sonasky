/** A random item, avoiding the one whose key is `not` when there's any other choice. */
export function pickRandom<T>(items: T[], key: (item: T) => string, not?: string): T | null {
  const pool = items.length > 1 ? items.filter((item) => key(item) !== not) : items;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
