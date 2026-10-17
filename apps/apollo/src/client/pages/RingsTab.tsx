import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search, Shuffle } from "lucide-react";
import { useSearchParams } from "react-router";
import type { DirectoryRing } from "../../shared/dto.ts";
import {
  isRingSort,
  pickRandomRing,
  RING_SORTS,
  searchRings,
  type RingSort,
} from "../../shared/ringDirectory.ts";
import { api } from "../api.ts";
import { Button, Card, Notice, Select, Spinner } from "../components/ui.tsx";

const SORT_OPTIONS = Object.entries(RING_SORTS).map(([value, label]) => ({ value, label }));

function RingCard({ ring }: { ring: DirectoryRing }) {
  const owner =
    ring.ownerDisplayName ?? (ring.ownerHandle ? `@${ring.ownerHandle}` : ring.ownerDid);
  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight break-words">{ring.name}</h2>
        {ring.description ? (
          <p className="line-clamp-3 text-neutral-600 dark:text-neutral-300">{ring.description}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          {ring.ownerAvatar ? (
            <img
              src={ring.ownerAvatar}
              alt=""
              className="h-6 w-6 flex-none rounded-full object-cover"
            />
          ) : (
            <div className="h-6 w-6 flex-none rounded-full bg-neutral-200 dark:bg-neutral-800" />
          )}
          <span className="truncate">
            {owner} · {ring.activeMembers} {ring.activeMembers === 1 ? "site" : "sites"}
          </span>
        </div>
        <a
          href={ring.url}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
        >
          Open ring <ArrowRight size={16} aria-hidden />
        </a>
      </div>
    </Card>
  );
}

export function RingsTab() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const rawSort = params.get("sort");
  const sort: RingSort = isRingSort(rawSort) ? rawSort : "recommended";

  const [rings, setRings] = useState<DirectoryRing[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .discoverRings()
      .then((res) => {
        if (res.rings) setRings(res.rings);
        else setError("Couldn't reach the ring index right now. Try again in a bit.");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load rings."))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => (rings ? searchRings(rings, query, sort) : []), [rings, query, sort]);

  const setParam = (key: string, value: string, fallback: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value && value !== fallback) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  const random = () => {
    const pick = pickRandomRing(shown);
    if (pick) window.location.assign(pick.url);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Webrings</h1>
        <p className="text-neutral-600 dark:text-neutral-300">
          Groups of Apollo sites that link to each other. Pick one and explore.
        </p>
        {rings ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {rings.length} {rings.length === 1 ? "ring" : "rings"}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
        <label className="relative block">
          <span className="sr-only">Search rings</span>
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setParam("q", e.target.value, "")}
            placeholder="Search by name, description or owner"
            className="w-full rounded-md border border-neutral-300 bg-white py-2 pr-3 pl-9 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </label>
        <Select
          label="Sort by"
          options={SORT_OPTIONS}
          value={sort}
          onChange={(e) => setParam("sort", e.target.value, "recommended")}
        />
      </div>

      <Button onClick={random} disabled={shown.length === 0}>
        <Shuffle size={16} aria-hidden />
        {query ? "Random matching ring" : "Random ring"}
      </Button>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? (
        <Spinner label="Finding rings..." />
      ) : rings && rings.length === 0 ? (
        <Notice tone="info">No rings yet. Make one from the editor and invite some sites!</Notice>
      ) : rings && shown.length === 0 ? (
        <Notice tone="info">No rings match "{query}".</Notice>
      ) : (
        <div className="space-y-4">
          {shown.map((ring) => (
            <RingCard key={ring.uri} ring={ring} />
          ))}
        </div>
      )}
    </div>
  );
}
