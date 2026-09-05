import { SONASKY_DID } from "@sonasky/labels-def";

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
};

const serviceHostname = requireEnv("SERVICE_HOSTNAME");

export const config = {
  /** Public hostname the service is reachable at (e.g. feeds.sonasky.app). */
  serviceHostname,
  /** did:web identity of this feed generator service. */
  serviceDid: `did:web:${serviceHostname}`,
  /** Account that owns the published app.bsky.feed.generator records. */
  publisherDid: SONASKY_DID,
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: requireEnv("DATABASE_URL"),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  /** How many days of post history to keep before pruning. */
  postRetentionDays: Number(process.env.POST_RETENTION_DAYS ?? 7),
} as const;
