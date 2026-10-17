import type { ThemeDefinition } from "../types.ts";

/**
 * Sky: Bluesky's own light, dim and dark color schemes.
 *
 * Colors come from @bsky.app/alf 0.1.15 (src/palette.ts), the design system
 * used by the Bluesky app (bluesky-social/social-app). MIT License,
 * Copyright 2023-2026 Bluesky Social PBC. Mapping, following alf's
 * createThemes():
 *
 *   light = DEFAULT_PALETTE
 *   dark  = invertPalette(DEFAULT_PALETTE)
 *   dim   = invertPalette(DEFAULT_SUBDUED_PALETTE)
 *
 *   background = contrast_0      (alf `bg`)
 *   surface    = contrast_25     (alf `bg_contrast_25`)
 *   text       = contrast_1000   (alf `text`)
 *   muted      = contrast_700    (alf `text_contrast_medium`)
 *   link       = primary_500 in light, primary_600 in dark/dim (alf `text_link`)
 *   accent     = primary_500 (Bluesky's button blue), except dim - see below
 */

const SOURCE =
  "Bluesky app color palette (@bsky.app/alf 0.1.15), MIT License, Copyright Bluesky Social PBC";
const AUTHOR = { name: "SonaSky" };

export const skyLight: ThemeDefinition = {
  id: "sky-light",
  name: "Sky (light)",
  description: "Bluesky's light colors.",
  author: AUTHOR,
  source: SOURCE,
  tokens: {
    background: "#ffffff", // contrast_0
    surface: "#f9fafb", // contrast_25
    text: "#000000", // contrast_1000
    muted: "#405168", // contrast_700
    accent: "#006aff", // primary_500
    accentText: "#ffffff",
    link: "#006aff", // primary_500
    fontBody: "sans",
    fontHeading: "sans",
    radius: "large",
    width: "narrow",
  },
};

export const skyDim: ThemeDefinition = {
  id: "sky-dim",
  name: "Sky (dim)",
  description: "Bluesky's dim dark mode: soft navy instead of black.",
  author: AUTHOR,
  source: SOURCE,
  tokens: {
    background: "#151d28", // subdued contrast_1000 (inverted contrast_0)
    surface: "#1c2736", // subdued contrast_975 (inverted contrast_25)
    text: "#ffffff", // subdued contrast_0 (inverted contrast_1000)
    muted: "#abb8c9", // subdued contrast_300 (inverted contrast_700)
    // Bluesky's dim button blue (subdued primary_500, #0F73FF) gives white
    // button text only 4.27:1; the next shade (subdued primary_600) clears 4.5:1.
    accent: "#0661e0", // subdued primary_600
    accentText: "#ffffff",
    link: "#4d97ff", // subdued primary_400 (inverted primary_600)
    fontBody: "sans",
    fontHeading: "sans",
    radius: "large",
    width: "narrow",
  },
};

export const skyDark: ThemeDefinition = {
  id: "sky-dark",
  name: "Sky (dark)",
  description: "Bluesky's dark mode: true black.",
  author: AUTHOR,
  source: SOURCE,
  tokens: {
    background: "#000000", // contrast_1000 (inverted contrast_0)
    surface: "#111822", // contrast_975 (inverted contrast_25)
    text: "#ffffff", // contrast_0 (inverted contrast_1000)
    muted: "#a5b2c5", // contrast_300 (inverted contrast_700)
    accent: "#006aff", // primary_500
    accentText: "#ffffff",
    link: "#4291ff", // primary_400 (inverted primary_600)
    fontBody: "sans",
    fontHeading: "sans",
    radius: "large",
    width: "narrow",
  },
};
