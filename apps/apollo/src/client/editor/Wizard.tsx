/**
 * Getting started: pick a template, name the site, pick a look, publish. Every
 * step is a choice the user makes - Apollo never writes content for them.
 */

import { useState } from "react";
import { Link as RouterLink } from "react-router";
import { CalendarDays, File, Link, Palette, PenLine, Users, type LucideIcon } from "lucide-react";
import type { SiteBundle } from "../../shared/dto.ts";
import { NSID_PAGE, NSID_POST, NSID_STYLE } from "../../shared/nsid.ts";
import { DEFAULT_THEME_ID, findTheme } from "../../shared/themes.ts";
import { TEMPLATES, type SiteTemplate, type TemplateIcon } from "../../templates/index.ts";
import { api, ApiFailure } from "../api.ts";
import { starterPackUriFrom } from "../bsky.ts";
import { Button, Card, Notice, TextInput } from "../components/ui.tsx";
import { THEME_RKEY, ThemePresetPicker } from "./ThemePanel.tsx";

const TEMPLATE_ICONS: Record<TemplateIcon, LucideIcon> = {
  link: Link,
  calendar: CalendarDays,
  users: Users,
  palette: Palette,
  pen: PenLine,
  file: File,
};

export function Wizard({ bundle, onDone }: { bundle: SiteBundle; onDone: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [template, setTemplate] = useState<SiteTemplate | null>(null);
  const [title, setTitle] = useState(
    bundle.handle ? `${bundle.handle.split(".")[0]}'s site` : "My site",
  );
  const [starterPack, setStarterPack] = useState("");
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!template) return;
    setBusy(true);
    setError(null);
    try {
      const result = template.build({
        did: bundle.did,
        handle: bundle.handle,
        title: title.trim(),
      });
      if (template.id === "starter-pack" && starterPack.trim()) {
        const uri = await starterPackUriFrom(starterPack);
        const home = result.pages.find((p) => p.slug === result.homePage);
        home?.record.blocks?.splice(2, 0, { $type: "app.sonasky.apollo.defs#starterPack", uri });
        // Drop the "add a starter pack block" tip, it's done.
        if (home?.record.blocks) {
          home.record.blocks = home.record.blocks.filter(
            (b) => !(b.$type === "app.sonasky.apollo.defs#text" && b.markdown.startsWith("_Tip:")),
          );
        }
      }
      // The theme's tokens are copied into the site; `basedOn` just credits where they came from.
      const theme = findTheme(themeId) ?? findTheme(DEFAULT_THEME_ID)!;
      await api.putRecord(NSID_STYLE, THEME_RKEY, {
        name: "Theme",
        tokens: theme.tokens,
        basedOn: theme.id,
      });
      for (const page of result.pages) await api.putRecord(NSID_PAGE, page.slug, page.record);
      for (const post of result.posts ?? []) await api.putRecord(NSID_POST, post.slug, post.record);
      // The site record goes last: until it exists, nothing is publicly visible.
      await api.putSite({
        title: title.trim(),
        description: result.description,
        homePage: result.homePage,
        nav: result.nav,
        theme: THEME_RKEY,
        blogEnabled: result.blogEnabled,
        createdAt: new Date().toISOString(),
      });
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiFailure || err instanceof Error ? err.message : "Something went wrong.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-medium text-sky-700 dark:text-sky-400">Step {step} of 3</p>
        <h1 className="text-2xl font-bold">
          {step === 1 ? "What do you want to make?" : step === 2 ? "Name your site" : "Pick a look"}
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          {step === 1
            ? "Pick a starting point. You can change everything later - add pages, move things around, or start over."
            : step === 2
              ? "This shows at the top of your site and in link previews."
              : "You can fine-tune colors and fonts afterwards in Theme."}
        </p>
      </div>

      {step === 1 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Just want to start a webring?{" "}
          <RouterLink to="/edit/rings" className="text-sky-700 hover:underline dark:text-sky-400">
            Make a ring
          </RouterLink>{" "}
          - you don't need a site for that.
        </p>
      ) : null}

      {step === 1 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((t) => {
            const Icon = TEMPLATE_ICONS[t.icon];
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setTemplate(t);
                    setThemeId(t.theme);
                    setStep(2);
                  }}
                  className="flex h-full w-full items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-left hover:border-sky-400 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <Icon size={28} className="mt-0.5 flex-none text-sky-600" aria-hidden />
                  <span>
                    <span className="block font-semibold">{t.name}</span>
                    <span className="block text-sm text-neutral-600 dark:text-neutral-400">
                      {t.summary}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {step === 2 ? (
        <Card className="space-y-4">
          <TextInput
            label="Site name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          {template?.id === "starter-pack" ? (
            <TextInput
              label="Your starter pack link (optional)"
              help="Open your starter pack on bsky.app and copy the address. You can add it later too."
              value={starterPack}
              onChange={(e) => setStarterPack(e.target.value)}
              placeholder="https://bsky.app/starter-pack/..."
            />
          ) : null}
          <div className="flex gap-2">
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button variant="primary" disabled={!title.trim()} onClick={() => setStep(3)}>
              Next
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="space-y-4">
          <ThemePresetPicker value={themeId} onPick={(theme) => setThemeId(theme.id)} />
          <Notice>
            When you publish, your site goes live at <strong>{bundle.siteUrl}</strong>. It's stored
            in your Bluesky account and anyone can see it, like your posts.
          </Notice>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="flex gap-2">
            <Button onClick={() => setStep(2)} disabled={busy}>
              Back
            </Button>
            <Button variant="primary" onClick={create} disabled={busy}>
              {busy ? "Creating your site..." : "Create my site"}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
