import { Client, CredentialManager } from "@atcute/client";
import type {} from "@atcute/atproto";
import type { ActorIdentifier } from "@atcute/lexicons";
import { getPds } from "./getPds";

export interface LabelerProfile {
  did: string;
  displayName?: string;
  avatarUrl?: string;
}

const fetchLabelerProfile = async (did: string): Promise<LabelerProfile> => {
  const pds = await getPds(did);
  if (!pds) {
    return { did };
  }

  try {
    const rpc = new Client({ handler: new CredentialManager({ service: pds }) });
    const response = await rpc.get("com.atproto.repo.getRecord", {
      params: {
        collection: "app.bsky.actor.profile",
        repo: did as ActorIdentifier,
        rkey: "self",
      },
    });
    const value = (response.data as any)?.value;
    const avatarCid = value?.avatar?.ref?.$link;
    return {
      did,
      displayName: value?.displayName,
      avatarUrl: avatarCid
        ? `https://cdn.bsky.app/img/avatar_thumbnail/plain/${did}/${avatarCid}@jpeg`
        : undefined,
    };
  } catch {
    return { did };
  }
};

export const fetchLabelerProfiles = async (
  labelerDids: string[],
): Promise<Map<string, LabelerProfile>> => {
  const profiles = await Promise.all(labelerDids.map(fetchLabelerProfile));
  return new Map(profiles.map((profile) => [profile.did, profile]));
};
