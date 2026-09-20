import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import Layout from "../../layouts/Home";
import { Button } from "../../components/ui/Button";
import { Chip } from "../../components/ui/Chip";
import { AtpAgent, type AppBskyActorDefs } from "@atproto/api";
import { PDS_COLLECTION_NS, RELAY_URL } from "../../const";

const publicAgent = new AtpAgent({ service: "https://public.api.bsky.app" });

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_RESULT_LIMIT = 8;
const USER_COUNT_PAGE_LIMIT = 1000;

interface ListReposByCollectionResponse {
  cursor?: string;
  repos: { did: string }[];
}

// AtpAgent attaches an `atproto-accept-labelers` header that the relay's CORS
// policy rejects, so this endpoint is called with a plain fetch instead.
async function listReposByCollectionPage(
  collection: string,
  cursor: string | undefined,
  signal: AbortSignal,
): Promise<ListReposByCollectionResponse> {
  const url = new URL("/xrpc/com.atproto.sync.listReposByCollection", RELAY_URL);
  url.searchParams.set("collection", collection);
  url.searchParams.set("limit", String(USER_COUNT_PAGE_LIMIT));
  if (cursor) url.searchParams.set("cursor", cursor);

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`listReposByCollection failed: ${response.status}`);
  return (await response.json()) as ListReposByCollectionResponse;
}

function Home() {
  const [handle, setHandle] = useState("");
  const [options, setOptions] = useState<AppBskyActorDefs.ProfileViewBasic[]>([]);
  const [loading, setLoading] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [userCount, setUserCount] = useState<number | null>(null);
  const navigate = useNavigate();

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController>(undefined);

  useEffect(
    () => () => {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    const countUsers = async () => {
      let cursor: string | undefined;
      let count = 0;
      do {
        const data = await listReposByCollectionPage(PDS_COLLECTION_NS, cursor, controller.signal);
        count += data.repos.length;
        cursor = data.cursor;
      } while (cursor);
      setUserCount(count);
    };

    countUsers().catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setUserCount(null);
      }
    });

    return () => controller.abort();
  }, []);

  const searchHandles = (query: string) => {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    const q = query.trim();
    if (!q) {
      setOptions([]);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      publicAgent.app.bsky.actor
        .searchActorsTypeahead({ limit: SEARCH_RESULT_LIMIT, q }, { signal: controller.signal })
        .then(({ data }) => {
          setOptions(data.actors);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setOptions([]);
          }
        })
        .finally(() => {
          if (abortRef.current === controller) {
            setLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setHandle(value);
    setOptionsOpen(true);
    searchHandles(value);
  };

  const navigateToHandle = (value: string) => {
    const finalHandle =
      value.startsWith("did:plc:") || value.includes(".") ? value : `${value}.bsky.social`;
    void navigate(`/profile/${finalHandle}`);
  };

  const handleSubmit = (
    event: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    navigateToHandle(handle);
  };

  return (
    <Layout>
      <div className="mx-auto max-w-sm px-4">
        <div className="flex flex-col items-center justify-center">
          <div className="flex w-full items-center">
            <form onSubmit={handleSubmit} className="flex w-full" autoComplete="off">
              <div className="relative w-full">
                <label htmlFor="bluesky-handle" className="mb-1 block text-sm font-medium">
                  Bluesky Handle
                </label>
                <div className="relative">
                  <input
                    id="bluesky-handle"
                    type="text"
                    value={handle}
                    onChange={handleInputChange}
                    onFocus={() => setOptionsOpen(true)}
                    onBlur={() => setTimeout(() => setOptionsOpen(false), 150)}
                    placeholder="some-username-here"
                    autoComplete="off"
                    data-1p-ignore
                    data-bwignore
                    data-form-type="other"
                    data-lpignore
                    data-protonpass-ignore
                    className="w-full rounded-md border border-gray-300 px-3 py-2 pr-28 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900"
                  />
                  {!(handle.startsWith("did:plc:") || handle.includes(".")) && (
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-500 dark:text-gray-400">
                      .bsky.social
                    </span>
                  )}
                </div>
                {optionsOpen && (loading || options.length > 0) && (
                  <ul className="absolute z-10 mt-1 w-full rounded-md border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-900">
                    {loading && (
                      <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                        Searching...
                      </li>
                    )}
                    {options.map((option) => (
                      <li key={option.did}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            navigateToHandle(option.handle);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <img
                            src={option.avatar}
                            alt=""
                            className="h-7 w-7 rounded-full bg-gray-200 dark:bg-gray-700"
                          />
                          <div>
                            <p className="text-sm">{option.displayName || option.handle}</p>
                            <p className="block text-xs text-gray-500 dark:text-gray-400">
                              @{option.handle}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSubmit}
                className="ml-2.5 mt-6 self-start"
              >
                View
              </Button>
            </form>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Enter a Bluesky handle to view the user's character(s)/info.
          </p>
          <div
            className={`mt-3 transition-all duration-700 ease-out ${
              userCount !== null ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
            }`}
          >
            <Chip
              icon={
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              }
              label={
                userCount !== null
                  ? `${userCount.toLocaleString()} ${userCount === 1 ? "user" : "users"} on Sonasky Ref`
                  : ""
              }
              colorClassName="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Home;
