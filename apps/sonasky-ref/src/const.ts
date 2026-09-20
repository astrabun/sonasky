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

export const ASSET_COLLECTION_NS = "app.sonasky.ref.asset";

export const GALLERY_COLLECTION_NS = "app.sonasky.ref.galleryImage";

export const ALLOWED_ASSET_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export const MAX_ASSET_SIZE_BYTES = 5_000_000;

export const LABELER_DIDS: string[] = [SONASKY_DID, SONASKY_POKEMON_DID];

// Bluesky's official moderation service (moderation.bsky.app), for the report-to-labeler feature.
export const BSKY_LABELER_DID = "did:plc:ar7c4by46qjdydhdevvrndac";

export const FLAGS = {
  SHOW_FEEDBACK_FORM_ALERT: false,
};
