/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  /** Base URL of the Swetrix instance */
  readonly SWETRIX_BASE_URL?: string;
  /** Swetrix project id. Analytics is disabled when unset. */
  readonly SWETRIX_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
