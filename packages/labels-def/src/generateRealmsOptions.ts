import { labels } from "./labels.ts";

export const generateRealmsOptions = () => {
  return new Set(
    Object.values(labels)
      .map((def) => def.realm)
      .filter((realm) => realm !== undefined),
  );
};
