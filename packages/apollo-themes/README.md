# @sonasky/apollo-themes

Color themes for [SonaSky Apollo](https://apollo.sonasky.app) sites. Every theme here shows up in
Apollo's theme picker: **official** themes first, then **community** themes, credited to their
authors. (Have an idea for a new kind of block instead? See
[`@sonasky/apollo-blocks`](../apollo-blocks).)

When someone picks a theme, Apollo **copies** its colors and settings into their own site, along
with a note of which theme it was based on. Their site never loads anything from this package
afterwards. So changing a theme here won't change anyone's existing site, and people can tweak a
theme freely after picking it.

## Contributing a community theme

You'll need a GitHub account and to be comfortable editing a file in a pull request. GitHub's
web editor is fine; you don't need to install anything.

**Easiest:** make your theme in Apollo (**Theme** panel), then press **Export --> Share with the
community**. Apollo writes the file for you, in exactly the format below, and runs the same checks
CI does. Download it and skip to step 3.

1. **Copy an example.** Duplicate one of the files in [`src/community/`](src/community/), for
   example `paper.ts`, and name the copy after your theme's id: `src/community/<your-id>.ts`.
2. **Fill it in:**

   ```ts
   import type { ThemeDefinition } from "../types.ts";

   export const lavenderFields: ThemeDefinition = {
     id: "lavender-fields", // permanent: lowercase letters, numbers, dashes
     name: "Lavender Fields", // shown in the picker, 40 characters max
     description: "Soft purples and a rounded font.", // optional, 140 max
     author: { name: "Your Name", handle: "you.bsky.social" }, // how you'd like to be credited
     tokens: {
       background: "#f6f3fb", // page background
       surface: "#ffffff", // cards and boxes
       text: "#241b33", // main text
       muted: "#5f5274", // softer text: captions, dates, menu
       accent: "#6d3fc0", // button background
       accentText: "#ffffff", // text on buttons
       link: "#5b2fae", // optional - links use `accent` if you leave this out
       fontBody: "rounded", // "sans" | "serif" | "mono" | "rounded"
       fontHeading: "sans",
       googleFonts: { heading: "Lexend" }, // optional, any Google Fonts family name
       radius: "large", // corners: "none" | "small" | "medium" | "large"
       width: "narrow", // page width: "narrow" | "medium" | "wide"
     },
   };
   ```

3. **List it** in [`src/index.ts`](src/index.ts): import it, then add it to `COMMUNITY_THEMES`,
   keeping that list in alphabetical order by id.
4. **Open a pull request.** Checks run automatically. If something's wrong, the failing check
   says exactly what, for example
   `theme "lavender-fields": button text on buttons is too low-contrast (3.9:1, needs 4.5:1)`.

You can also run the checks yourself with `pnpm -F @sonasky/apollo-themes test`.

### Rules

- **Readable.** Every theme must pass the WCAG 4.5:1 contrast minimum for: text and softer text
  on the background and on cards, button text on buttons, and links on the background. A contrast
  checker such as [WebAIM's](https://webaim.org/resources/contrastchecker/) helps while you pick
  colors.
- **Colors and options only.** Themes can't include custom CSS, images or anything else that
  loads from somewhere. That keeps every theme safe to review at a glance. People who want more
  can add their own CSS in Apollo's Advanced section.
- **Fonts: built-in or Google Fonts.** `fontBody` / `fontHeading` pick one of four built-in font
  styles. Optionally, `googleFonts` names a family from [Google Fonts](https://fonts.google.com),
  spelled exactly as Google shows it. The built-in choice stays as the fallback while it loads.
  Name a family that exists: an unknown name just falls back silently.
- **Ids are permanent.** Sites remember which theme they were based on by id, so ids can't be
  renamed once merged. Names and descriptions can change.
- **Credit sources.** If your colors come from somewhere else (a brand, an editor theme, another
  project), add a `source` with where they came from and the license, and only use them if that
  license allows it.
- **Be kind.** Theme names and descriptions should be unproblematic.

## For developers

- `OFFICIAL_THEMES`, `COMMUNITY_THEMES`, `ALL_THEMES`, `findTheme(id)` and `DEFAULT_THEME_ID` -
  the catalog.
- `validateTheme(theme)` returns a list of problems (empty means valid). `contrast(a, b)` gives
  the WCAG ratio, and `contrastPairs(tokens)` lists the color pairs that must stay readable.
  Apollo's theme panel uses the same pairs for its warnings.
- `themeDefinitionSource(theme)` writes a theme as a `src/community/<id>.ts` file (what Apollo's
  Export uses). `themeIdFromName(name)` turns a name into a valid id.
- `isGoogleFontFamily(name)` checks a Google Fonts family name.
- `ThemeTokens` and friends are the token types Apollo's `app.sonasky.apollo.style` records use.

The Sky themes use colors from Bluesky's design system,
[`@bsky.app/alf`](https://github.com/bluesky-social/social-app), MIT License, Copyright Bluesky
Social PBC. See [`src/official/sky.ts`](src/official/sky.ts) for the exact mapping.
