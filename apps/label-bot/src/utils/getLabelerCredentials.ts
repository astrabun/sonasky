export type LabelerCredentials = {
  identifier: string;
  password: string;
};

/**
 * Looks up Bluesky login creds for a labeler realm (e.g. "prime", "pokemon")
 * from {REALM}_BSKY_USER / {REALM}_BSKY_PASS env vars, matching the
 * convention used by @sonasky/labels-sync.
 */
const getLabelerCredentials = (realm: string): LabelerCredentials => {
  const prefix = realm.toUpperCase();
  const identifier = process.env[`${prefix}_BSKY_USER`];
  const password = process.env[`${prefix}_BSKY_PASS`];

  if (!identifier || !password) {
    throw new Error(
      `Missing credentials for labeler realm "${realm}" (expected ${prefix}_BSKY_USER / ${prefix}_BSKY_PASS env vars)`,
    );
  }

  return { identifier, password };
};

export { getLabelerCredentials };
