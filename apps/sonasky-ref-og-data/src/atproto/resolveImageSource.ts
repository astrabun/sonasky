// Ported from apps/sonasky-ref/src/helpers/resolveImageSource.ts.
const ASSET_COLLECTION_NS = "app.sonasky.ref.asset";

export interface ResolvedImage {
  cid: string;
  did: string;
  alt: string;
}

export type GetRecordFn = (params: {
  collection: string;
  repo: string;
  rkey: string;
}) => Promise<{ data: { value: any; cid?: string } }>;

export function getUriCollection(atUri: string): string {
  return atUri.split("/")[3] ?? "";
}

export async function resolvePostImages(
  getRecord: GetRecordFn,
  atUri: string,
): Promise<ResolvedImage[]> {
  const [, , did, , postRkey] = atUri.split("/");
  const { data } = await getRecord({
    collection: "app.bsky.feed.post",
    repo: did,
    rkey: postRkey,
  });
  const { value } = data;
  const { embed } = value;
  if (embed?.$type === "app.bsky.embed.images" && embed.images) {
    return embed.images.map((img: any) => ({
      alt: img.alt ?? "",
      cid: img.image.ref.$link ?? img.image.ref.toString(),
      did,
    }));
  }
  if (embed?.$type === "app.bsky.embed.record" && embed.record?.uri) {
    return resolvePostImages(getRecord, embed.record.uri);
  }
  if (embed?.$type === "app.bsky.embed.recordWithMedia") {
    const ownImages: ResolvedImage[] = embed.media?.images
      ? embed.media.images.map((img: any) => ({
          alt: img.alt ?? "",
          cid: img.image.ref.$link ?? img.image.ref.toString(),
          did,
        }))
      : [];
    const quotedImages = embed.record?.record?.uri
      ? await resolvePostImages(getRecord, embed.record.record.uri)
      : [];
    return [...ownImages, ...quotedImages];
  }
  return [];
}

export async function resolveAssetImage(
  getRecord: GetRecordFn,
  atUri: string,
): Promise<ResolvedImage[]> {
  const [, , did, , assetRkey] = atUri.split("/");
  const { data } = await getRecord({
    collection: ASSET_COLLECTION_NS,
    repo: did,
    rkey: assetRkey,
  });
  const { value } = data;
  const cid = value?.image?.ref?.$link ?? value?.image?.ref?.toString();
  return cid ? [{ alt: value.alt ?? "", cid, did }] : [];
}

export async function resolveRefImages(
  getRecord: GetRecordFn,
  atUri: string,
): Promise<ResolvedImage[]> {
  if (getUriCollection(atUri) === ASSET_COLLECTION_NS) {
    return resolveAssetImage(getRecord, atUri);
  }
  return resolvePostImages(getRecord, atUri);
}

export function buildImageUrl(
  pdsUrl: string,
  atUri: string,
  did: string,
  cid: string,
  size: "thumbnail" | "fullsize",
): string {
  if (getUriCollection(atUri) === ASSET_COLLECTION_NS) {
    return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
  }
  const variant = size === "thumbnail" ? "feed_thumbnail" : "feed_fullsize";
  return `https://cdn.bsky.app/img/${variant}/plain/${did}/${cid}@jpeg`;
}
