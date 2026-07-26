import { isActiveLabel } from "./isActiveLabel.ts";
import { labels } from "./labels.ts";

const DEFAULT_REALM = "prime";

export const generateBskyDefs = (realm?: string, englishOnly?: boolean) => {
  const useRealm = realm || DEFAULT_REALM;
  const labelValues = Object.keys(labels)
    .filter((i) => labels[i].realm === useRealm)
    .filter((i) => isActiveLabel(labels[i]));
  const labelValueDefinitions = labelValues.map((id) => ({
    blurs: "none",
    locales:
      englishOnly === true ? labels[id].locales.filter((i) => i.lang == "en") : labels[id].locales,
    severity: "inform",
    adultOnly: false,
    identifier: id,
    defaultSetting: "warn",
  }));
  return {
    labelValues: labelValues,
    labelValueDefinitions: labelValueDefinitions,
  };
};

export const generateBskyDefsEnglish = (realm?: string) => {
  return generateBskyDefs(realm || DEFAULT_REALM, true);
};
