import type { ThemeDefinition } from "../types.ts";

export const terminal: ThemeDefinition = {
  id: "terminal",
  name: "Terminal",
  description: "Green-on-black monospace, square corners.",
  author: { name: "SonaSky" },
  tokens: {
    background: "#0d0d0d",
    surface: "#171717",
    text: "#d4f5d4",
    muted: "#8fb88f",
    accent: "#4ade80",
    accentText: "#0d0d0d",
    fontBody: "mono",
    fontHeading: "mono",
    radius: "none",
    width: "medium",
  },
};
