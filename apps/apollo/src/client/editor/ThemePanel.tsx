import { useState } from "react";
import { Check } from "lucide-react";
import { NSID_STYLE } from "../../shared/nsid.ts";
import type {
  StyleRecord,
  ThemeFont,
  ThemeRadius,
  ThemeTokens,
  ThemeWidth,
} from "../../shared/records.ts";
import {
  COMMUNITY_THEMES,
  contrast,
  contrastPairs,
  DEFAULT_THEME,
  DEFAULT_THEME_ID,
  findTheme,
  isGoogleFontFamily,
  MIN_CONTRAST,
  OFFICIAL_THEMES,
  THEME_FONTS,
  THEME_RADII,
  THEME_WIDTHS,
  type ThemeDefinition,
} from "../../shared/themes.ts";
import { api, ApiFailure } from "../api.ts";
import { Button, Card, Notice, Select, TextInput } from "../components/ui.tsx";
import { editable, useEditorState } from "./context.tsx";
import { Preview } from "./Preview.tsx";
import { ThemeExportButton } from "./ThemeExport.tsx";

/** rkey of the style record the theme panel writes. */
export const THEME_RKEY = "theme";

type ColorKey = "background" | "surface" | "text" | "muted" | "accent" | "accentText" | "link";

const COLOR_FIELDS: { key: ColorKey; label: string }[] = [
  { key: "background", label: "Page background" },
  { key: "surface", label: "Cards and boxes" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Softer text" },
  { key: "accent", label: "Buttons" },
  { key: "accentText", label: "Text on buttons" },
  { key: "link", label: "Links" },
];

function colorOf(tokens: ThemeTokens, key: ColorKey): string {
  return key === "link" ? (tokens.link ?? tokens.accent) : tokens[key];
}

function Swatches({ tokens }: { tokens: ThemeTokens }) {
  return (
    <span className="flex gap-1" aria-hidden>
      {[tokens.background, tokens.text, tokens.accent].map((c, i) => (
        <span
          key={i}
          className="h-4 w-4 rounded-full border border-black/10"
          style={{ background: c }}
        />
      ))}
    </span>
  );
}

function ThemeCard({
  theme,
  selected,
  onPick,
}: {
  theme: ThemeDefinition;
  selected: boolean;
  onPick: (theme: ThemeDefinition) => void;
}) {
  const t = theme.tokens;
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        title={theme.description}
        onClick={() => onPick(theme)}
        className={`w-full rounded-lg border p-3 text-left ${
          selected
            ? "border-sky-500 ring-2 ring-sky-500"
            : "border-neutral-200 hover:border-sky-400 dark:border-neutral-800"
        }`}
        style={{
          background: t.background,
          color: t.text,
          fontFamily: THEME_FONTS[t.fontBody].stack,
        }}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="font-semibold">{theme.name}</span>
          <Swatches tokens={t} />
        </span>
        <span
          className="mt-2 block px-2 py-1 text-center text-xs font-semibold"
          style={{
            background: t.accent,
            color: t.accentText,
            borderRadius: THEME_RADII[t.radius].css,
          }}
        >
          Button
        </span>
      </button>
    </li>
  );
}

/** Official themes, then community themes (credited), from @sonasky/apollo-themes. */
export function ThemePresetPicker({
  value,
  onPick,
}: {
  value?: string;
  onPick: (theme: ThemeDefinition) => void;
}) {
  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {OFFICIAL_THEMES.map((theme) => (
          <ThemeCard key={theme.id} theme={theme} selected={value === theme.id} onPick={onPick} />
        ))}
      </ul>
      {COMMUNITY_THEMES.length ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            From the community
          </h4>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COMMUNITY_THEMES.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                selected={value === theme.id}
                onPick={onPick}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** "Based on Paper by Someone" credit line. */
export function themeCredit(id: string | undefined): string | null {
  const theme = findTheme(id);
  if (!theme) return null;
  const by = theme.author.handle ? `@${theme.author.handle}` : theme.author.name;
  return `${theme.name} by ${by}`;
}

/** Popular Google Fonts, as suggestions - any family name works. */
const GOOGLE_FONT_SUGGESTIONS = [
  "Atkinson Hyperlegible",
  "Caveat",
  "DM Sans",
  "Fira Code",
  "Inter",
  "JetBrains Mono",
  "Lato",
  "Lexend",
  "Lora",
  "Merriweather",
  "Montserrat",
  "Noto Sans",
  "Nunito",
  "Open Sans",
  "Pacifico",
  "Playfair Display",
  "Poppins",
  "Quicksand",
  "Roboto",
  "Source Serif 4",
  "Space Grotesk",
];

function FontPicker({
  label,
  font,
  google,
  onFont,
  onGoogle,
}: {
  label: string;
  font: ThemeFont;
  google?: string;
  onFont: (font: ThemeFont) => void;
  onGoogle: (family: string) => void;
}) {
  const [draft, setDraft] = useState(google ?? "");
  const value = draft.trim().replace(/\s+/g, " ");
  const invalid = value !== "" && !isGoogleFontFamily(value);
  return (
    <div className="space-y-2">
      <Select
        label={google ? `${label}: built-in font (used while ${google} loads)` : `${label}: style`}
        value={font}
        onChange={(e) => onFont(e.target.value as ThemeFont)}
        options={Object.entries(THEME_FONTS).map(([v, f]) => ({ value: v, label: f.label }))}
      />
      <TextInput
        label={`${label}: Google font (optional)`}
        list="apollo-google-fonts"
        placeholder="e.g. Atkinson Hyperlegible"
        value={draft}
        error={
          invalid ? "Use letters, numbers and spaces only, exactly as Google Fonts shows it." : null
        }
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!invalid) onGoogle(value);
        }}
      />
      <datalist id="apollo-google-fonts">
        {GOOGLE_FONT_SUGGESTIONS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
    </div>
  );
}

/**
 * Starting look, colors, fonts, corners and width. Shared by the site's Theme
 * panel and ring pages. `onChange` gets a token patch, plus the catalog theme
 * id when a starting look was picked.
 */
export function ThemeTokensEditor({
  tokens,
  basedOn,
  onChange,
}: {
  tokens: ThemeTokens;
  basedOn?: string;
  onChange: (patch: Partial<ThemeTokens>, basedOn?: string) => void;
}) {
  const setGoogleFont = (slot: "body" | "heading", family: string) => {
    const next = { ...tokens.googleFonts, [slot]: family || undefined };
    onChange({ googleFonts: next.body || next.heading ? next : undefined });
  };
  const lowContrast = contrastPairs(tokens).filter((p) => contrast(p.fg, p.bg) < MIN_CONTRAST);
  const credit = themeCredit(basedOn);

  return (
    <>
      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Start from a look</h3>
        <ThemePresetPicker
          value={basedOn}
          onPick={(theme) => {
            // A copy: the site keeps these colors even if the catalog theme changes later.
            onChange(
              {
                ...theme.tokens,
                link: theme.tokens.link ?? theme.tokens.accent,
                googleFonts: theme.tokens.googleFonts,
              },
              theme.id,
            );
          }}
        />
        {credit ? <p className="text-xs text-neutral-500">Based on {credit}.</p> : null}
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Colors</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COLOR_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input
                type="color"
                value={colorOf(tokens, f.key)}
                onChange={(e) => onChange({ [f.key]: e.target.value } as Partial<ThemeTokens>)}
                className="h-8 w-10 cursor-pointer rounded border border-neutral-300 dark:border-neutral-700"
              />
              {f.label}
            </label>
          ))}
        </div>
        {lowContrast.length ? (
          <Notice tone="warn">
            Some colors may be hard to read: {lowContrast.map((p) => p.label).join(", ")}. Try
            making them darker or lighter.
          </Notice>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Fonts</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <FontPicker
            key={`body-${tokens.googleFonts?.body ?? ""}`}
            label="Text"
            font={tokens.fontBody}
            google={tokens.googleFonts?.body}
            onFont={(fontBody) => onChange({ fontBody })}
            onGoogle={(body) => setGoogleFont("body", body)}
          />
          <FontPicker
            key={`heading-${tokens.googleFonts?.heading ?? ""}`}
            label="Headings"
            font={tokens.fontHeading}
            google={tokens.googleFonts?.heading}
            onFont={(fontHeading) => onChange({ fontHeading })}
            onGoogle={(heading) => setGoogleFont("heading", heading)}
          />
        </div>
        <p className="text-xs text-neutral-500">
          Browse{" "}
          <a
            href="https://fonts.google.com"
            target="_blank"
            rel="noreferrer"
            className="text-sky-700 hover:underline dark:text-sky-400"
          >
            Google Fonts
          </a>{" "}
          and type a font's name exactly as shown.
        </p>
      </Card>

      <Card className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Corners"
          value={tokens.radius}
          onChange={(e) => onChange({ radius: e.target.value as ThemeRadius })}
          options={Object.entries(THEME_RADII).map(([value, r]) => ({ value, label: r.label }))}
        />
        <Select
          label="Page width"
          value={tokens.width}
          onChange={(e) => onChange({ width: e.target.value as ThemeWidth })}
          options={Object.entries(THEME_WIDTHS).map(([value, w]) => ({ value, label: w.label }))}
        />
      </Card>
    </>
  );
}

export function ThemePanel() {
  const { bundle, site, setSite, upsert } = useEditorState();
  const existing = bundle.styles.find((s) => s.rkey === (site.value.theme ?? THEME_RKEY));
  const [tokens, setTokens] = useState<ThemeTokens>(existing?.value.tokens ?? DEFAULT_THEME);
  const [basedOn, setBasedOn] = useState<string | undefined>(
    existing?.value.basedOn ?? (existing?.value.tokens ? undefined : DEFAULT_THEME_ID),
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<ThemeTokens>) => {
    setTokens((t) => ({ ...t, ...patch }));
    setDirty(true);
    setSaved(false);
  };

  const themeRecord: StyleRecord = {
    $type: NSID_STYLE,
    name: "Theme",
    tokens,
    basedOn,
    css: existing?.value.css,
    createdAt: existing?.value.createdAt ?? "",
    updatedAt: "",
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const rkey = site.value.theme ?? THEME_RKEY;
      const res = await api.putRecord(NSID_STYLE, rkey, editable(themeRecord));
      upsert(NSID_STYLE, {
        rkey,
        cid: res.cid,
        value: { ...themeRecord, updatedAt: new Date().toISOString() },
      });
      // Re-save the site so its version changes and visitors get the new look right away.
      const siteRes = await api.putSite({ ...editable(site.value), theme: rkey });
      setSite({ ...site, cid: siteRes.cid, value: { ...site.value, theme: rkey } });
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't save the theme.");
    } finally {
      setBusy(false);
    }
  };

  const home = bundle.pages.find((p) => p.rkey === site.value.homePage);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Theme</h2>
          <div className="flex flex-wrap gap-2">
            <ThemeExportButton tokens={tokens} basedOn={basedOn} handle={bundle.handle} />
            <Button variant="primary" disabled={!dirty || busy} onClick={save}>
              {busy ? (
                "Saving..."
              ) : dirty ? (
                "Publish theme"
              ) : (
                <>
                  Published <Check size={14} aria-hidden />
                </>
              )}
            </Button>
          </div>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {saved ? <Notice tone="success">Theme published.</Notice> : null}

        <ThemeTokensEditor
          tokens={tokens}
          basedOn={basedOn}
          onChange={(patch, nextBasedOn) => {
            set(patch);
            if (nextBasedOn !== undefined) setBasedOn(nextBasedOn);
          }}
        />
        <p className="text-xs text-neutral-500">
          Want more control? You can add your own CSS in <strong>Advanced</strong>.
        </p>
      </div>
      <div className="xl:sticky xl:top-4 xl:self-start">
        {home ? (
          <Preview
            target={{ kind: "page", slug: home.rkey, record: home.value }}
            theme={themeRecord}
            site={{ ...site.value, theme: site.value.theme ?? THEME_RKEY }}
          />
        ) : null}
      </div>
    </div>
  );
}
