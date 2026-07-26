import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { generateSonaskyPostLink } from "./utils/generateSonaskyPostLink";
import { getAllLabels } from "@sonasky/labels-def";
import { useDebounce } from "./hooks/useDebounce";
import { useLikeCounts } from "./hooks/useLikeCounts";
import {
  arrayCodec,
  stringCodec,
  useUrlSyncedState,
  type UrlCodec,
} from "./hooks/useUrlSyncedState";

const REALM_ORDER = ["prime", "pokemon"] as const;
const REALM_LABELS: Record<(typeof REALM_ORDER)[number], string> = {
  prime: "Primary",
  pokemon: "Pokemon",
};

type SortBy = "default" | "likes-desc" | "likes-asc" | "alpha-asc" | "alpha-desc";
const SORT_CODEC: UrlCodec<SortBy> = {
  toParam: (value) => (value === "default" ? null : value),
  fromParam: (raw) => raw as SortBy,
};

function App() {
  const allLabels = useMemo(() => getAllLabels({ localesToObject: true }), []);

  // Some labels (e.g. sonasky-ref-sheet-user) have no associated post, so
  // they can't get a bsky.app link or like count here.
  const labels = useMemo(
    () =>
      allLabels.filter((label) => Boolean(label.post)) as ((typeof allLabels)[number] & {
        post: string;
      })[],
    [allLabels],
  );

  const localeOptions = useMemo(() => {
    const langs = new Set<string>();
    labels.forEach((label) => {
      Object.keys(label.locales).forEach((lang) => langs.add(lang));
    });
    return Array.from(langs).sort();
  }, [labels]);

  const [preferredLocale, setPreferredLocale] = useUrlSyncedState(
    "preferredLocale",
    "en",
    stringCodec("en"),
  );

  const realmOptions = useMemo(() => {
    const realms = new Set<string>();
    labels.forEach((label) => realms.add(label.realm));
    return REALM_ORDER.filter((realm) => realms.has(realm));
  }, [labels]);

  const [realmFilter, setRealmFilter] = useUrlSyncedState("realmFilter", "all", stringCodec("all"));

  const categoryOptions = useMemo(() => {
    const cats = new Map<string, string>();
    labels.forEach((label) => {
      const key = label.category?.["en"];
      if (!key) return;
      cats.set(key, label.category?.[preferredLocale] ?? key);
    });
    return Array.from(cats.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [labels, preferredLocale]);

  const [categoryFilter, setCategoryFilter] = useUrlSyncedState<string[]>(
    "categoryFilter",
    [],
    arrayCodec,
  );
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!categoryDropdownOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!categoryDropdownRef.current?.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [categoryDropdownOpen]);

  const visibleCategoryOptions = useMemo(() => {
    const query = categorySearch.trim().toLowerCase();
    if (!query) return categoryOptions;
    return categoryOptions.filter(([, display]) => display.toLowerCase().includes(query));
  }, [categoryOptions, categorySearch]);

  const toggleCategory = (key: string) => {
    setCategoryFilter((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const [persistedSearch, setPersistedSearch] = useUrlSyncedState("search", "", stringCodec(""));
  const [search, setSearch] = useState(persistedSearch);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debouncedSearch = useDebounce(search);

  // Only push to localStorage/the URL once typing settles, not on every keystroke.
  useEffect(() => {
    setPersistedSearch(debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const namedLabels = useMemo(() => {
    return labels
      .filter((label) => realmFilter === "all" || label.realm === realmFilter)
      .filter(
        (label) =>
          categoryFilter.length === 0 || categoryFilter.includes(label.category?.["en"] ?? ""),
      )
      .map((label) => ({
        label,
        name: label.locales[preferredLocale]?.name ?? label.locales["en"]?.name ?? "",
      }));
  }, [labels, preferredLocale, realmFilter, categoryFilter]);

  const filteredLabels = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return namedLabels;
    return namedLabels.filter(({ name }) => name.toLowerCase().includes(query));
  }, [namedLabels, debouncedSearch]);

  const suggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return namedLabels.filter(({ name }) => name.toLowerCase().includes(query)).slice(0, 8);
  }, [namedLabels, search]);

  const postRefs = useMemo(
    () => labels.map((label) => ({ id: label.id, post: label.post })),
    [labels],
  );
  const likeCounts = useLikeCounts(postRefs);

  const [sortBy, setSortBy] = useUrlSyncedState<SortBy>("sortBy", "default", SORT_CODEC);

  const resetFilters = () => {
    setRealmFilter("all");
    setCategoryFilter([]);
    setSortBy("default");
    setSearch("");
    setPersistedSearch("");
  };

  const sortedLabels = useMemo(() => {
    if (sortBy === "default") return filteredLabels;
    if (sortBy === "alpha-asc" || sortBy === "alpha-desc") {
      return [...filteredLabels].sort((a, b) => {
        const diff = a.name.localeCompare(b.name);
        return sortBy === "alpha-asc" ? diff : -diff;
      });
    }
    return [...filteredLabels].sort((a, b) => {
      const diff = (likeCounts[a.label.id] ?? 0) - (likeCounts[b.label.id] ?? 0);
      return sortBy === "likes-asc" ? diff : -diff;
    });
  }, [filteredLabels, likeCounts, sortBy]);

  return (
    <>
      <section className="spacer"></section>
      <section id="center">
        <div className="hero">
          <img
            src={"/sonasky_favicon.png"}
            className="base"
            width="170"
            height="179"
            alt="SonaSky Icon"
          />
        </div>
        <div>
          <h1>SonaSky Label Browser</h1>
          <p>Find your species!</p>
        </div>
        <div style={{ display: "flex", flexDirection: "row", gap: "1rem" }}>
          <select value={preferredLocale} onChange={(e) => setPreferredLocale(e.target.value)}>
            {localeOptions.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
          <select value={realmFilter} onChange={(e) => setRealmFilter(e.target.value)}>
            <option value="all">All Labels</option>
            {realmOptions.map((realm) => (
              <option key={realm} value={realm}>
                {REALM_LABELS[realm]}
              </option>
            ))}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="default">Default order</option>
            <option value="alpha-asc">Alphabetic (A-Z)</option>
            <option value="alpha-desc">Alphabetic (Z-A)</option>
            <option value="likes-desc">Most users</option>
            <option value="likes-asc">Least users</option>
          </select>
          <button type="button" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
        <div className="search">
          <input
            type="text"
            value={search}
            placeholder="Search for a species..."
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 100)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="suggestions">
              {suggestions.map(({ label, name }) => (
                <li key={label.id}>
                  <button
                    type="button"
                    onMouseDown={() => {
                      setSearch(name);
                      setShowSuggestions(false);
                    }}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="category-filter" ref={categoryDropdownRef}>
          <button type="button" onClick={() => setCategoryDropdownOpen((open) => !open)}>
            Categories{categoryFilter.length > 0 ? ` (${categoryFilter.length})` : ""}
          </button>
          {categoryDropdownOpen && (
            <div className="category-panel">
              <input
                type="text"
                value={categorySearch}
                placeholder="Search categories..."
                onChange={(e) => setCategorySearch(e.target.value)}
              />
              <ul>
                <li>
                  <label>
                    <input
                      type="checkbox"
                      checked={categoryFilter.length === 0}
                      onChange={() => setCategoryFilter([])}
                    />
                    All categories
                  </label>
                </li>
                {visibleCategoryOptions.map(([key, display]) => (
                  <li key={key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={categoryFilter.includes(key)}
                        onChange={() => toggleCategory(key)}
                      />
                      {display}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
      <section className="spacer"></section>
      {!(showSuggestions && suggestions.length > 0) && (
        <section id="browser">
          <div id="species">
            {sortedLabels.map(({ label, name }) => (
              <p key={label.id}>
                <a
                  href={generateSonaskyPostLink({ id: label.post })}
                  target={"_blank"}
                  rel={"noopener noreferrer"}
                >
                  {name}
                </a>
                {likeCounts[label.id] !== undefined ? (
                  <span className="like-count"> ({likeCounts[label.id]})</span>
                ) : (
                  <span className="like-count"> (...)</span>
                )}
              </p>
            ))}
          </div>
        </section>
      )}
      <section className="spacer"></section>
    </>
  );
}

export default App;
