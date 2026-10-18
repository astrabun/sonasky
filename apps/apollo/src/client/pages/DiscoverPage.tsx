import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Shuffle } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import type {
  DirectorySite,
  DiscoverSite,
  MeResponse,
  SiteDirectoryResponse,
} from "../../shared/dto.ts";
import { DEFAULT_SITE_SORT, isSiteSort, SITE_SORTS } from "../../shared/siteDirectory.ts";
import { api } from "../api.ts";
import { HandleLookup } from "../components/HandleLookup.tsx";
import { LikeButton } from "../components/LikeButton.tsx";
import { SiteCount } from "../components/SiteCount.tsx";
import { Button, Card, Notice, Select, Spinner } from "../components/ui.tsx";
import { RingsTab } from "./RingsTab.tsx";

const SORT_OPTIONS = Object.entries(SITE_SORTS).map(([value, label]) => ({ value, label }));

function SiteCard({ site, me }: { site: DiscoverSite; me: MeResponse | null }) {
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
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={site.url}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          Visit site <ArrowRight size={16} aria-hidden />
        </a>
        <LikeButton site={site.did} me={me} />
      </div>
    </Card>
  );
}

/** A compact directory entry. */
function DirectoryRow({ site, me }: { site: DirectorySite; me: MeResponse | null }) {
  const byline = site.displayName ?? (site.handle ? `@${site.handle}` : site.did);
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        {site.avatar ? (
          <img src={site.avatar} alt="" className="h-10 w-10 flex-none rounded-full object-cover" />
        ) : (
          <div className="h-10 w-10 flex-none rounded-full bg-neutral-200 dark:bg-neutral-800" />
        )}
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-lg font-bold tracking-tight break-words">{site.title}</h3>
          <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{byline}</p>
          {site.description ? (
            <p className="line-clamp-2 text-sm text-neutral-600 dark:text-neutral-300">
              {site.description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LikeButton site={site.did} count={site.likes} me={me} />
        <a
          href={site.url}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
        >
          Visit <ArrowRight size={16} aria-hidden />
        </a>
      </div>
    </Card>
  );
}

const TABS = [
  { id: "sites", label: "Sites", to: "/discover" },
  { id: "rings", label: "Rings", to: "/discover/rings" },
] as const;

export type DiscoverTab = (typeof TABS)[number]["id"];

export function DiscoverPage({ tab, me }: { tab: DiscoverTab; me: MeResponse | null }) {
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
      {tab === "rings" ? <RingsTab /> : <SitesTab me={me} />}
    </div>
  );
}

function SitesTab({ me }: { me: MeResponse | null }) {
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
          Sites people made with Apollo. Look someone up, take a random one, or browse them all.
        </p>
        <SiteCount className="text-sm text-neutral-500 dark:text-neutral-400" />
      </div>

      <HandleLookup renderSite={(found) => <SiteCard site={found} me={me} />} />

      <h2 className="pt-2 text-xl font-semibold tracking-tight">Random site</h2>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading && !site ? (
        <Spinner label="Finding a site..." />
      ) : site ? (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <SiteCard site={site} me={me} />
        </div>
      ) : !error ? (
        <Notice tone="info">No sites to show right now. Check back soon!</Notice>
      ) : null}

      <Button onClick={next} disabled={loading}>
        <Shuffle size={16} aria-hidden />
        {loading ? "Shuffling..." : "Show me another"}
      </Button>

      <SiteDirectory me={me} />
    </div>
  );
}

function SiteDirectory({ me }: { me: MeResponse | null }) {
  const [params, setParams] = useSearchParams();
  const rawSort = params.get("sort");
  const sort = isSiteSort(rawSort) ? rawSort : DEFAULT_SITE_SORT;
  const page = Math.max(1, Number(params.get("page")) || 1);

  const [data, setData] = useState<SiteDirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const top = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    api
      .discoverSites(sort, page)
      .then((res) => {
        if (!live) return;
        if (res.sites) setData(res);
        else setError("Couldn't reach the site index right now. Try again in a bit.");
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : "Couldn't load sites."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [sort, page]);

  const update = (changes: Record<string, string | null>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  const goTo = (n: number) => {
    update({ page: n > 1 ? String(n) : null });
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="space-y-4 pt-2" aria-labelledby="site-directory">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="site-directory" ref={top} className="text-xl font-semibold tracking-tight">
          All sites
        </h2>
        <div className="w-full sm:w-60">
          <Select
            label="Sort by"
            options={SORT_OPTIONS}
            value={sort}
            onChange={(e) =>
              update({
                sort: e.target.value === DEFAULT_SITE_SORT ? null : e.target.value,
                page: null,
              })
            }
          />
        </div>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading && !data ? (
        <Spinner label="Loading sites..." />
      ) : data && data.total === 0 ? (
        <Notice tone="info">No sites to list yet. Check back soon!</Notice>
      ) : data?.sites ? (
        <div
          className={`space-y-4 ${loading ? "opacity-60 transition-opacity" : "transition-opacity"}`}
        >
          {data.sites.map((site) => (
            <DirectoryRow key={site.did} site={site} me={me} />
          ))}
        </div>
      ) : null}

      {data && data.pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          <Button onClick={() => goTo(data.page - 1)} disabled={loading || data.page <= 1}>
            <ArrowLeft size={16} aria-hidden /> Previous
          </Button>
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            Page {data.page} of {data.pages}
          </span>
          <Button onClick={() => goTo(data.page + 1)} disabled={loading || data.page >= data.pages}>
            Next <ArrowRight size={16} aria-hidden />
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
