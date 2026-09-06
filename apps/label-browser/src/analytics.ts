import * as Swetrix from "swetrix";

const projectId = import.meta.env.SWETRIX_PROJECT_ID?.trim();
const baseUrl = import.meta.env.SWETRIX_BASE_URL?.trim();

/**
 * Initialise Swetrix analytics + pageview tracking.
 *
 * No-op unless both SWETRIX_PROJECT_ID and SWETRIX_BASE_URL are set at build
 * time (see .env.example). This keeps local/dev builds free of analytics.
 */
export function initAnalytics(): void {
  if (!projectId || !baseUrl) return;

  Swetrix.init(projectId, {
    apiURL: `${baseUrl.replace(/\/+$/, "")}/backend/v1/log`,
  });
  void Swetrix.trackViews();
}
