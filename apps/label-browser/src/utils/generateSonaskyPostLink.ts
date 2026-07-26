import { SONASKY_DID } from "@sonasky/labels-def";

/**
 * Options for generating the post link.
 */
type GenerateSonaskyPostLinkOptions = {
  /** ID of the post on SonaSky's account */
  id: string;
};

const generateSonaskyPostLink = (options: GenerateSonaskyPostLinkOptions): string => {
  const { id } = options;
  return `https://bsky.app/profile/${SONASKY_DID}/post/${id}`;
};

export { generateSonaskyPostLink };
