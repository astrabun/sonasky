import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import Layout from "../../layouts/Home";
import { Button } from "../../components/ui/Button";
import { AtpAgent, type AppBskyActorDefs } from "@atproto/api";

const publicAgent = new AtpAgent({ service: "https://public.api.bsky.app" });

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_RESULT_LIMIT = 8;

function Home() {
  const [handle, setHandle] = useState("");
  const [options, setOptions] = useState<AppBskyActorDefs.ProfileViewBasic[]>([]);
  const [loading, setLoading] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
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
        </div>
      </div>
    </Layout>
  );
}

export default Home;
