import { PER_SPECIES_TRENDING_DEFAULT } from "@sonasky/feeds-def";
import { SONASKY_DID } from "@sonasky/labels-def";

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
};

const parseBool = (value: string | undefined, fallback: boolean): boolean =>
  value == null || value === "" ? fallback : /^(1|true|yes|on)$/i.test(value);

const serviceHostname = requireEnv("SERVICE_HOSTNAME");

export const config = {
  /** Public hostname the service is reachable at (e.g. feeds.sonasky.app). */
  serviceHostname,
  /** did:web identity of this feed generator service. */
  serviceDid: `did:web:${serviceHostname}`,
  /** Account that owns the published app.bsky.feed.generator records. */
  publisherDid: SONASKY_DID,
  port: Number(process.env.PORT ?? 8080),
  /** Required by the running service; resolved lazily so publish-only scripts
   * (which never touch Postgres) don't need it set. */
  get databaseUrl(): string {
    return requireEnv("DATABASE_URL");
  },
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  /** How many days of post history to keep before pruning. */
  postRetentionDays: Number(process.env.POST_RETENTION_DAYS ?? 7),
  /** Also define/serve a trending feed per species label. */
  perSpeciesTrending: parseBool(process.env.TRENDING_PER_SPECIES, PER_SPECIES_TRENDING_DEFAULT),
} as const;
