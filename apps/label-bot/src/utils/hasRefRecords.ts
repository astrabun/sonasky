import { AtpAgent } from "@atproto/api";
import { getPds } from "./getPds.js";

export const REF_COLLECTION_NS = "app.sonasky.ref";

/**
 * Checks the user's PDS for any remaining app.sonasky.ref records. Returns
 * undefined when the answer can't be determined (PDS unresolvable, request
 * failed), so callers can avoid acting on unknown state.
 */
const hasRefRecords = async (did: string): Promise<boolean | undefined> => {
  const pds = await getPds(did);
  if (!pds) {
    return undefined;
  }
  try {
    const agent = new AtpAgent({ service: pds });
    const res = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: REF_COLLECTION_NS,
      limit: 1,
    });
    return res.data.records.length > 0;
  } catch (error) {
    console.error(`Failed to list ${REF_COLLECTION_NS} records for ${did}:`, error);
    return undefined;
  }
};

export { hasRefRecords };
