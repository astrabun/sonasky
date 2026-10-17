/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  /** Apollo's self-hosted Swetrix pageview endpoint, including `/log`. Analytics is disabled when unset. */
  readonly VITE_APOLLO_SWETRIX_API_URL?: string;
  /** Apollo's Swetrix project id. Analytics is disabled when unset. */
  readonly VITE_APOLLO_SWETRIX_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
