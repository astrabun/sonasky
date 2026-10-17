import type { ThemeDefinition, ThemeTokens } from "./types.ts";

/** "Lavender Fields!" -> "lavender-fields" (a valid theme id). */
export function themeIdFromName(name: string): string {
  const id = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return id || "my-theme";
}

/** "lavender-fields" -> "lavenderFields" (the exported variable name). */
export function themeVariableName(id: string): string {
  const camel = id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  return /^[a-z]/.test(camel) ? camel : `theme${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
}

const TOKEN_ORDER: (keyof ThemeTokens)[] = [
  "background",
  "surface",
  "text",
  "muted",
  "accent",
  "accentText",
  "link",
  "fontBody",
  "fontHeading",
  "googleFonts",
  "radius",
  "width",
];

const TOKEN_COMMENTS: Partial<Record<keyof ThemeTokens, string>> = {
  background: "page background",
  surface: "cards and boxes",
  text: "main text",
  muted: "softer text: captions, dates, menu",
  accent: "button background",
  accentText: "text on buttons",
  link: "links",
};

/**
 * Source for `src/community/<id>.ts`, in the exact format this package's
 * README describes - what Apollo's "Export theme" hands to contributors.
 */
export function themeDefinitionSource(theme: ThemeDefinition): string {
  const lines: string[] = [];
  lines.push(`import type { ThemeDefinition } from "../types.ts";`, "");
  lines.push(`export const ${themeVariableName(theme.id)}: ThemeDefinition = {`);
  lines.push(`  id: ${JSON.stringify(theme.id)},`);
  lines.push(`  name: ${JSON.stringify(theme.name)},`);
  if (theme.description) lines.push(`  description: ${JSON.stringify(theme.description)},`);
  const author = theme.author.handle
    ? `{ name: ${JSON.stringify(theme.author.name)}, handle: ${JSON.stringify(theme.author.handle)} }`
    : `{ name: ${JSON.stringify(theme.author.name)} }`;
  lines.push(`  author: ${author},`);
  if (theme.source) lines.push(`  source: ${JSON.stringify(theme.source)},`);
  lines.push(`  tokens: {`);
  for (const key of TOKEN_ORDER) {
    const value = theme.tokens[key];
    if (value === undefined) continue;
    if (key === "googleFonts") {
      const g = value as NonNullable<ThemeTokens["googleFonts"]>;
      const parts = [
        g.body ? `body: ${JSON.stringify(g.body)}` : "",
        g.heading ? `heading: ${JSON.stringify(g.heading)}` : "",
      ].filter(Boolean);
      if (parts.length) lines.push(`    googleFonts: { ${parts.join(", ")} },`);
      continue;
    }
    const comment = TOKEN_COMMENTS[key] ? ` // ${TOKEN_COMMENTS[key]}` : "";
    lines.push(`    ${key}: ${JSON.stringify(value)},${comment}`);
  }
  lines.push(`  },`, `};`, "");
  return lines.join("\n");
}
