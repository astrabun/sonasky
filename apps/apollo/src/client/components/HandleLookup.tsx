import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import type { DiscoverSite, SiteLookupResponse } from "../../shared/dto.ts";
import { api } from "../api.ts";
import { Button, Notice } from "./ui.tsx";

const APPVIEW = "https://public.api.bsky.app";
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_RESULT_LIMIT = 6;

interface Actor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

/** Bluesky's handle typeahead, from the public AppView. */
async function typeahead(q: string, signal: AbortSignal): Promise<Actor[]> {
  const url = new URL("/xrpc/app.bsky.actor.searchActorsTypeahead", APPVIEW);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(SEARCH_RESULT_LIMIT));
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  return ((await res.json()) as { actors?: Actor[] }).actors ?? [];
}

const NO_SITE: Record<NonNullable<SiteLookupResponse["reason"]>, (who: string) => string> = {
  not_found: (who) => `We couldn't find a Bluesky account for ${who}.`,
  no_site: (who) => `${who} doesn't have an Apollo site yet.`,
  unavailable: (who) => `${who}'s site isn't available right now.`,
};

/** Look up a handle: shows the account's site (via `renderSite`) or says why there isn't one. */
export function HandleLookup({ renderSite }: { renderSite: (site: DiscoverSite) => ReactNode }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Actor[]>([]);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ who: string; res: SiteLookupResponse } | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abort = useRef<AbortController>(undefined);

  useEffect(() => () => clearTimeout(debounce.current), []);

  const search = (value: string) => {
    clearTimeout(debounce.current);
    abort.current?.abort();
    const q = value.trim().replace(/^@/, "");
    if (!q) return setOptions([]);
    debounce.current = setTimeout(() => {
      const controller = new AbortController();
      abort.current = controller;
      typeahead(q, controller.signal)
        .then(setOptions)
        .catch(() => {});
    }, SEARCH_DEBOUNCE_MS);
  };

  const lookup = (actor: string) => {
    const value = actor.trim().replace(/^@/, "");
    if (!value) return;
    clearTimeout(debounce.current);
    abort.current?.abort();
    setOpen(false);
    setLooking(true);
    setError(null);
    api
      .lookupSite(value)
      .then((res) => setResult({ who: `@${res.handle ?? value}`, res }))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't look that up."))
      .finally(() => setLooking(false));
  };

  return (
    <div className="space-y-3">
      <form
        className="flex items-start gap-2"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          lookup(query);
        }}
      >
        <div className="relative w-full">
          <label htmlFor="apollo-site-lookup" className="sr-only">
            Look up a handle
          </label>
          <Search
            size={16}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
          />
          <input
            id="apollo-site-lookup"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              search(e.target.value);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Find someone's site: alice.bsky.social"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore
            className="w-full rounded-md border border-neutral-300 bg-white py-2 pr-3 pl-9 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
          {open && options.length > 0 ? (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              {options.map((a) => (
                <li key={a.did}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setQuery(a.handle);
                      lookup(a.handle);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    {a.avatar ? (
                      <img src={a.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-neutral-200 dark:bg-neutral-800" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{a.displayName || a.handle}</span>
                      <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                        @{a.handle}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Button
          type="submit"
          variant="primary"
          className="shrink-0 whitespace-nowrap"
          disabled={looking || !query.trim()}
        >
          {looking ? "Looking..." : "Look up"}
        </Button>
      </form>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {result && !looking ? (
        result.res.site ? (
          renderSite(result.res.site)
        ) : (
          <Notice tone="info">{NO_SITE[result.res.reason ?? "no_site"](result.who)}</Notice>
        )
      ) : null}
    </div>
  );
}
