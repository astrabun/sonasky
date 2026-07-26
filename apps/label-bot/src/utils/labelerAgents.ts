import { Agent, CredentialSession } from "@atproto/api";
import { generateRealmsOptions } from "@sonasky/labels-def";
import { getLabelerCredentials } from "./getLabelerCredentials.js";

const BSKY_SERVICE_URL = new URL("https://bsky.social");

const agentsByRealm = new Map<string, Agent>();

/**
 * Logs into every labeler realm defined in @sonasky/labels-def and caches
 * an Agent for each. Session refresh on expiry is handled automatically by
 * CredentialSession, so callers just need this to run once at startup.
 */
const initLabelerAgents = async () => {
  for (const realm of generateRealmsOptions()) {
    const { identifier, password } = getLabelerCredentials(realm);
    const session = new CredentialSession(BSKY_SERVICE_URL);
    await session.login({ identifier, password });
    agentsByRealm.set(realm, new Agent(session));
    console.log(`[${realm}] Authenticated as ${session.did}`);
  }
};

/** Gets the logged-in Agent for a labeler realm, once initLabelerAgents has run. */
const getLabelerAgent = (realm: string): Agent => {
  const agent = agentsByRealm.get(realm);
  if (!agent) {
    throw new Error(`No labeler agent initialized for realm "${realm}"`);
  }
  return agent;
};

export { initLabelerAgents, getLabelerAgent };
