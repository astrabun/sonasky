import { SONASKY_DID, getAllLabels } from "@sonasky/labels-def";

export type GetLabelerOptions = {
  /** Post URI to find the associated labeler realm for */
  postUri: string;
};

const getLabeler = (options: GetLabelerOptions) => {
  const { postUri } = options;
  return getAllLabels().find(
    (label) =>
      label.post !== undefined &&
      `at://${SONASKY_DID}/app.bsky.feed.post/${label.post}` === postUri,
  );
};

export { getLabeler };
