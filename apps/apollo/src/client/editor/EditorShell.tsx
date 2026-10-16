import { useCallback, useEffect, useState } from "react";
import {
  CircleQuestionMark,
  ExternalLink,
  FileText,
  Image,
  Palette,
  PenLine,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Navigate, NavLink, Route, Routes } from "react-router";
import type { Entry, SiteBundle } from "../../shared/dto.ts";
import type { SiteRecord } from "../../shared/records.ts";
import { api, ApiFailure } from "../api.ts";
import { Notice, Spinner } from "../components/ui.tsx";
import { AdvancedPanel } from "./AdvancedPanel.tsx";
import { EditorProvider, useEditorState } from "./context.tsx";
import { MediaLibrary } from "./MediaLibrary.tsx";
import { BlogPanel, PageEditorRoute, PagesPanel } from "./PagesPanel.tsx";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { ThemePanel } from "./ThemePanel.tsx";
import { Wizard } from "./Wizard.tsx";

const TABS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/edit/pages", label: "Pages", icon: FileText },
  { to: "/edit/blog", label: "Blog", icon: PenLine },
  { to: "/edit/theme", label: "Theme", icon: Palette },
  { to: "/edit/media", label: "Media", icon: Image },
  { to: "/edit/settings", label: "Settings", icon: Settings },
  { to: "/edit/advanced", label: "Advanced", icon: Wrench },
];

function Sidebar() {
  const { bundle, site } = useEditorState();
  return (
    <nav aria-label="Editor" className="space-y-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="truncate font-semibold">{site.value.title}</p>
        <a
          href={bundle.siteUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 truncate text-xs text-sky-700 hover:underline dark:text-sky-400"
        >
          View your site <ExternalLink size={12} aria-hidden />
        </a>
      </div>
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap ${
                  isActive
                    ? "bg-sky-100 font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-100"
                    : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`
              }
            >
              <t.icon size={16} aria-hidden />
              {t.label}
            </NavLink>
          </li>
        ))}
        <li>
          <NavLink
            to="/help"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <CircleQuestionMark size={16} aria-hidden />
            Help
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}

function MediaPanel() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Media</h2>
      <MediaLibrary />
    </div>
  );
}

function Editor() {
  return (
    <div className="grid gap-6 md:grid-cols-[12rem_1fr]">
      <Sidebar />
      <div className="min-w-0">
        <Routes>
          <Route path="pages" element={<PagesPanel />} />
          <Route path="pages/:slug" element={<PageEditorRoute kind="page" />} />
          <Route path="blog" element={<BlogPanel />} />
          <Route path="blog/:slug" element={<PageEditorRoute kind="post" />} />
          <Route path="theme" element={<ThemePanel />} />
          <Route path="media" element={<MediaPanel />} />
          <Route path="settings" element={<SettingsPanel />} />
          <Route path="advanced" element={<AdvancedPanel />} />
          <Route path="*" element={<Navigate to="/edit/pages" replace />} />
        </Routes>
      </div>
    </div>
  );
}

/** Loads the user's site and shows either the wizard (no site yet) or the editor. */
export function Dashboard({ onReauth }: { onReauth: () => void }) {
  const [bundle, setBundle] = useState<SiteBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(() => {
    setError(null);
    api
      .site()
      .then((b) => {
        setBundle(b);
        setVersion((v) => v + 1);
      })
      .catch((err) => {
        if (
          err instanceof ApiFailure &&
          (err.code === "reauth_required" || err.code === "unauthenticated")
        ) {
          onReauth();
          return;
        }
        setError(err instanceof Error ? err.message : "Couldn't load your site.");
      });
  }, [onReauth]);

  useEffect(load, [load]);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!bundle) return <Spinner label="Loading your site..." />;
  if (!bundle.site) return <Wizard bundle={bundle} onDone={load} />;

  return (
    <EditorProvider
      key={version}
      initial={bundle as SiteBundle & { site: Entry<SiteRecord> }}
      reload={load}
    >
      <Editor />
    </EditorProvider>
  );
}
