import type { ThemeDefinition } from "../types.ts";

export const paper: ThemeDefinition = {
  id: "paper",
  name: "Paper",
  description: "Warm off-white with classic serif type, good for writing.",
  author: { name: "SonaSky" },
  tokens: {
    background: "#fbf8f1",
    surface: "#ffffff",
    text: "#2b2622",
    muted: "#6b625a",
    accent: "#9a3412",
    accentText: "#ffffff",
    fontBody: "serif",
    fontHeading: "serif",
    radius: "small",
    width: "medium",
  },
};
