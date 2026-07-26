import { SONASKY_DID, getAllLabels } from "@sonasky/labels-def";

export type IsSonaskyScopedOptions = {
  /** Post URI to check if in scope */
  postUri: string;
};

const isSonaskyScoped = (options: IsSonaskyScopedOptions) => {
  const { postUri } = options;
  const inScopePostIds = getAllLabels()
    .filter((label) => label.post !== undefined)
    .map((label) => `at://${SONASKY_DID}/app.bsky.feed.post/${label.post}`);
  return inScopePostIds.includes(postUri);
};

export { isSonaskyScoped };
