import { SONASKY_DID, SONASKY_POKEMON_DID } from "@sonasky/labels-def";

const { searchParams } = new URL(globalThis.location.href);

// Inserted during build
declare const process: { env: { NODE_ENV: string } };

export const ENV = searchParams.get("env") ?? process.env.NODE_ENV;

export const PLC_DIRECTORY_URL: string | undefined =
  searchParams.get("plc_directory_url") ??
  //   (ENV === 'development' ? 'http://localhost:2582' : undefined)
  undefined;

export const HANDLE_RESOLVER_URL: string =
  searchParams.get("handle_resolver") ??
  //   (ENV === 'development' ? 'http://localhost:2584' : 'https://bsky.social')
  "https://bsky.social";

export const PDS_COLLECTION_NS = "app.sonasky.ref";

export const LABELER_DIDS: string[] = [SONASKY_DID, SONASKY_POKEMON_DID];

export const FLAGS = {
  SHOW_FEEDBACK_FORM_ALERT: false,
};
