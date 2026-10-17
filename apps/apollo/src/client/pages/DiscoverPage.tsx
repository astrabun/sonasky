import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Shuffle } from "lucide-react";
import { Link } from "react-router";
import type { DiscoverSite } from "../../shared/dto.ts";
import { api } from "../api.ts";
import { SiteCount } from "../components/SiteCount.tsx";
import { Button, Card, Notice, Spinner } from "../components/ui.tsx";
import { RingsTab } from "./RingsTab.tsx";

function SiteCard({ site }: { site: DiscoverSite }) {
  const byline = site.handle ? `@${site.handle}` : site.did;
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        {site.avatar ? (
          <img src={site.avatar} alt="" className="h-12 w-12 flex-none rounded-full object-cover" />
        ) : (
          <div className="h-12 w-12 flex-none rounded-full bg-neutral-200 dark:bg-neutral-800" />
        )}
        <div className="min-w-0">
          {site.displayName ? <p className="truncate font-medium">{site.displayName}</p> : null}
          <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{byline}</p>
        </div>
      </div>
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight break-words">{site.title}</h2>
        {site.description ? (
          <p className="text-neutral-600 dark:text-neutral-300">{site.description}</p>
        ) : null}
      </div>
      <a
        href={site.url}
        className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
      >
        Visit site <ArrowRight size={16} aria-hidden />
      </a>
    </Card>
  );
}

const TABS = [
  { id: "sites", label: "Sites", to: "/discover" },
  { id: "rings", label: "Rings", to: "/discover/rings" },
] as const;

export type DiscoverTab = (typeof TABS)[number]["id"];

export function DiscoverPage({ tab }: { tab: DiscoverTab }) {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <nav
        aria-label="Discover"
        className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800"
      >
        {TABS.map((t) => (
          <Link
            key={t.id}
            to={t.to}
            aria-current={t.id === tab ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              t.id === tab
                ? "border-sky-600 text-sky-700 dark:text-sky-400"
                : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "rings" ? <RingsTab /> : <SitesTab />}
    </div>
  );
}

function SitesTab() {
  const [site, setSite] = useState<DiscoverSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<string | undefined>(undefined);

  const next = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .discover(current.current)
      .then((res) => {
        current.current = res.site?.did ?? current.current;
        setSite(res.site);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load a site."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(next, [next]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Discover</h1>
        <p className="text-neutral-600 dark:text-neutral-300">
          A random site someone made with Apollo.
        </p>
        <SiteCount className="text-sm text-neutral-500 dark:text-neutral-400" />
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading && !site ? (
        <Spinner label="Finding a site..." />
      ) : site ? (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <SiteCard site={site} />
        </div>
      ) : !error ? (
        <Notice tone="info">No sites to show right now. Check back soon!</Notice>
      ) : null}

      <Button onClick={next} disabled={loading}>
        <Shuffle size={16} aria-hidden />
        {loading ? "Shuffling..." : "Show me another"}
      </Button>
    </div>
  );
}
