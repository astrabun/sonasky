import * as Swetrix from "swetrix";

/** Pageviews under these prefixes are never sent: the editor is private to the signed-in user. */
const UNTRACKED_PREFIXES = ["/edit"];

function isUntracked(path: string): boolean {
  return UNTRACKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Start Swetrix pageview tracking. A no-op unless both Apollo Swetrix env vars are set at build time. */
export function initAnalytics(): void {
  const pid = import.meta.env.VITE_APOLLO_SWETRIX_PROJECT_ID;
  const apiURL = import.meta.env.VITE_APOLLO_SWETRIX_API_URL;
  if (!pid || !apiURL) return;

  Swetrix.init(pid, { apiURL });
  void Swetrix.trackViews({
    callback: (payload) => !payload.pg || !isUntracked(payload.pg),
  });
}
