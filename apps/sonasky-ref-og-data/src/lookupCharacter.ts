import { Client, CredentialManager } from "@atcute/client";
import type {} from "@atcute/atproto";
import type { ActorIdentifier } from "@atcute/lexicons";
import { getPds } from "./atproto/getPds";
import { handleResolver } from "./atproto/handleResolver";
import { buildImageUrl, resolveRefImages } from "./atproto/resolveImageSource";

const PDS_COLLECTION_NS = "app.sonasky.ref";

export interface CharacterMeta {
  name: string;
  imageUrl?: string;
}

// Mirrors the fetch flow in apps/sonasky-ref/src/pages/View/ViewCharacter/ViewCharacter.tsx:
// resolve the owning repo's PDS, list its app.sonasky.ref records to find the one
// matching rkey, then resolve the character's ref sheet image (if any). Pass
// useAlt to prefer the character's alt ref (falls back to the main ref sheet
// if the character has no alt ref set).
export async function lookupCharacter(
  blueskyHandleOrDid: string,
  rkey: string,
  handleResolverUrl: string,
  useAlt = false,
): Promise<CharacterMeta | null> {
  const did = blueskyHandleOrDid.startsWith("did:")
    ? blueskyHandleOrDid
    : await handleResolver.resolve(blueskyHandleOrDid, handleResolverUrl);
  if (!did) {
    return null;
  }

  const pdsUrl = (await getPds(did)) ?? handleResolverUrl;
  const rpc = new Client({ handler: new CredentialManager({ service: pdsUrl }) });

  const getRecord = (params: { collection: string; repo: string; rkey: string }) =>
    rpc.get("com.atproto.repo.getRecord", {
      params: { ...params, repo: params.repo as ActorIdentifier } as any,
    }) as Promise<{ data: { value: any; cid?: string } }>;

  const listed = await rpc.get("com.atproto.repo.listRecords", {
    params: { collection: PDS_COLLECTION_NS, repo: did as ActorIdentifier },
  });
  const record = (listed.data as any).records.find((rec: any) => rec.uri.split("/").pop() === rkey);
  if (!record) {
    return null;
  }

  const character = record.value.character;
  if (!character?.name) {
    return null;
  }

  const useAltRef =
    useAlt && typeof character.altRef === "string" && character.altRef.startsWith("at://");
  const refSheet = useAltRef ? character.altRef : character.refSheet;
  const refSheetImageIndex = useAltRef ? character.altRefImageIndex : character.refSheetImageIndex;

  if (typeof refSheet !== "string" || !refSheet.startsWith("at://")) {
    return { name: character.name };
  }

  try {
    const images = await resolveRefImages(getRecord, refSheet);
    const imageIndex = refSheetImageIndex ?? 0;
    const img = images[imageIndex] ?? images[0];
    if (!img) {
      return { name: character.name };
    }
    return {
      name: character.name,
      imageUrl: buildImageUrl(pdsUrl, refSheet, img.did, img.cid, "fullsize"),
    };
  } catch {
    return { name: character.name };
  }
}
