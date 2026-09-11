import type { PostImage, Profile } from "./types";
import { fetchPostImages, fetchProfile } from "./api";

const profileCache = new Map<string, Promise<Profile | undefined>>();
const imageCache = new Map<string, Promise<PostImage[]>>();

export function getProfile(did: string): Promise<Profile | undefined> {
  if (!profileCache.has(did)) {
    profileCache.set(did, fetchProfile(did));
  }
  return profileCache.get(did)!;
}

export function getPostImages(atUri: string): Promise<PostImage[]> {
  if (!imageCache.has(atUri)) {
    imageCache.set(atUri, fetchPostImages(atUri));
  }
  return imageCache.get(atUri)!;
}
