import type { ThemeDefinition } from "../types.ts";

export const windowsXp: ThemeDefinition = {
  id: "windows-xp",
  name: "Windows XP",
  // Optional custom CSS for the full XP look: see windows-xp.md next to this file.
  description: "Luna grey windows and title-bar blue.",
  author: { name: "Astra", handle: "astrabun.com" },
  source:
    "XP.css 0.2.6 (botoxparty/XP.css), MIT License, Copyright 2020 Adam Hammad, Jordan Scales",
  tokens: {
    background: "#ece9d8", // XP.css window face
    surface: "#ffffff",
    text: "#000000",
    muted: "#4d4d4d",
    accent: "#0054e3", // title-bar blue
    accentText: "#ffffff",
    link: "#0000ff", // XP.css `a`
    fontBody: "sans",
    fontHeading: "sans",
    radius: "small",
    width: "medium",
  },
};
