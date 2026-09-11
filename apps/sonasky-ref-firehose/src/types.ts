export interface Character {
  name: string;
  species?: string;
  pronouns?: string;
  nsfw?: boolean;
  refSheet?: string;
  refSheetImageIndex?: number;
  altRef?: string;
  altRefImageIndex?: number;
  description?: string;
}

export interface Profile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface PostImage {
  alt: string;
  url: string;
}

export interface FirehoseEvent {
  id: string;
  did: string;
  timeUs: number;
  operation: "create" | "update" | "delete";
  rkey: string;
  character?: Character;
}
