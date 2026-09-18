import { Link, useParams } from "react-router";
import Layout from "../../layouts/View";
import { useCallback, useEffect, useState } from "react";
import { Client, CredentialManager } from "@atcute/client";
import type {} from "@atcute/atproto";
import type { ActorIdentifier, Handle } from "@atcute/lexicons";
import { HANDLE_RESOLVER_URL } from "../../const";
import { getPds } from "../../helpers/getPds";

function View() {
  const UNKNOWN_ERROR = "INT__UNKNOWN_ERROR__INT";

  const manager = new CredentialManager({ service: HANDLE_RESOLVER_URL });

  const { blueskyHandleOrDID } = useParams<{ blueskyHandleOrDID: string }>();
  const lookupMode = blueskyHandleOrDID?.startsWith("did:") ? "did" : "handle";
  const [handle, setHandle] = useState<string | undefined>();
  const [did, setDid] = useState<string | undefined>();
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingText, setLoadingText] = useState<string>("Loading.");
  const [error, setError] = useState<boolean>(false);
  const [altPds, setAltPds] = useState<string>(HANDLE_RESOLVER_URL);
  const [rpc, setRpc] = useState<Client>(new Client({ handler: manager }));

  const handleGetPds = async () => {
    if (did) {
      const pds = await getPds(did);
      if (HANDLE_RESOLVER_URL !== pds && pds) {
        setAltPds(pds);
        const newRpc = new Client({
          handler: new CredentialManager({ service: pds }),
        });
        setRpc(newRpc);
      }
    }
  };

  useEffect(() => {
    void handleGetPds();
  }, [did]);

  const [minLoadingTimePassed, setMinLoadingTimePassed] = useState<boolean>(false);

  const [repoData, setRepoData] = useState<any>();
  const [sonaRecords, setSonaRecords] = useState<any>();
  const loadSonaRecords = useCallback(async () => {
    if (did) {
      await rpc
        .get("com.atproto.repo.listRecords", {
          params: {
            collection: "app.sonasky.ref",
            repo: (did ?? "") as ActorIdentifier,
          },
        })
        .then((response) => {
          const { records } = response.data as any;
          const sorted = [...records].sort((a: any, b: any) => {
            const ai = a.value?.character?.displayIndex;
            const bi = b.value?.character?.displayIndex;
            if (ai === undefined && bi === undefined) {
              return 0;
            }
            if (ai === undefined) {
              return 1;
            }
            if (bi === undefined) {
              return -1;
            }
            return ai - bi;
          });
          setSonaRecords(sorted);
        });
    }
  }, [repoData]);
  useEffect(() => {
    void loadSonaRecords();
  }, [repoData]);

  const minLoadingTime = 1000;

  useEffect(() => {
    const minLoadingTimer = setTimeout(() => {
      setMinLoadingTimePassed(true);
    }, minLoadingTime);
    return () => clearTimeout(minLoadingTimer);
  }, []);

  const handleLookupError = (error: any) => {
    setHandle(UNKNOWN_ERROR);
    setDid(UNKNOWN_ERROR);
    if (minLoadingTimePassed) {
      setLoading(false);
      setError(true);
      console.error(error);
    }
  };

  useEffect(() => {
    if (lookupMode === "did") {
      if (blueskyHandleOrDID?.startsWith("did:web:")) {
        /* For did:web, we already have the DID. Handle/repoData resolved
                in the second effect once handleGetPds updates rpc to the correct PDS. */
        setDid(blueskyHandleOrDID);
      } else {
        rpc
          .get("com.atproto.repo.describeRepo", {
            params: {
              repo: (blueskyHandleOrDID ?? "") as ActorIdentifier,
            },
          })
          .then((response) => {
            const { data } = response;
            if (data) {
              setHandle((data as any).handle);
              setDid((data as any).did);
            } else {
              setHandle(UNKNOWN_ERROR);
              setDid(UNKNOWN_ERROR);
            }
            if (minLoadingTimePassed) {
              setLoading(false);
            }
          })
          .catch((error) => {
            handleLookupError(error);
          });
      }
    } else {
      rpc
        .get("com.atproto.identity.resolveHandle", {
          params: {
            handle: (blueskyHandleOrDID ?? "") as Handle,
          },
        })
        .then((response) => {
          const { data } = response;
          if (data) {
            setHandle(blueskyHandleOrDID ?? "");
            setDid((data as any).did);
          } else {
            setHandle(UNKNOWN_ERROR);
            setDid(UNKNOWN_ERROR);
          }
          if (minLoadingTimePassed) {
            setLoading(false);
          }
        })
        .catch((error) => {
          console.log(error);
          handleLookupError(error);
        });
    }
  }, [blueskyHandleOrDID, minLoadingTimePassed, rpc]);

  useEffect(() => {
    if (error) {
      return;
    }
    if (did?.startsWith("did:plc:")) {
      void rpc
        .get("com.atproto.repo.describeRepo", {
          params: {
            repo: (blueskyHandleOrDID ?? "") as Handle,
          },
        })
        .then((response) => {
          const { data } = response;
          setRepoData(data);
        });
    } else if (did?.startsWith("did:web:") && !handle) {
      void rpc
        .get("com.atproto.repo.describeRepo", {
          params: { repo: did as ActorIdentifier },
        })
        .then((response) => {
          const { data } = response;
          if (data) {
            setRepoData(data);
            setHandle((data as any).handle);
          }
        })
        .catch(() => {
          // Fires before rpc is updated to the correct PDS; rpc change triggers retry
        });
    }
  }, [handle, did, rpc]);

  useEffect(() => {
    if (minLoadingTimePassed && did?.startsWith("did:web:") && handle && handle !== UNKNOWN_ERROR) {
      setLoading(false);
    }
  }, [did, handle, minLoadingTimePassed]);

  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        setLoadingText((prev) => {
          if (prev === "Loading...") {
            return "Loading.";
          }
          if (prev === "Loading..") {
            return "Loading...";
          }
          return "Loading..";
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [loading]);

  return (
    <Layout>
      <div style={{ marginTop: "2rem" }} />
      <div className="mx-auto max-w-6xl px-4">
        {loading && <p className="mb-2">{loadingText}</p>}
        {error ? (
          <>
            <p>An error occurred. Sorry!</p>
            <Link to="/" className="text-inherit no-underline">
              Go home?
            </Link>
          </>
        ) : (
          <>
            <div
              className={`transition-opacity duration-[2000ms] ${loading ? "opacity-0" : "opacity-100"}`}
            >
              <a
                href={`https://bsky.app/profile/${handle}`}
                target="_blank"
                rel="noreferrer"
                className="text-inherit no-underline"
              >
                <p className="text-2xl sm:text-4xl">@{handle}</p>
                <p className="ml-8 text-xs">{did}</p>
                {altPds && <p className="ml-8 text-xs">PDS: {altPds}</p>}
              </a>
              <hr className="my-4 border-gray-300 dark:border-gray-700" />
              {sonaRecords !== undefined && (
                <>
                  {sonaRecords === null ? (
                    <p>No characters found</p>
                  ) : (
                    <p className="mb-2 text-2xl font-semibold">Characters</p>
                  )}
                  {sonaRecords?.map((record: any) => (
                    <Link
                      key={record.uri}
                      to={`/profile/${did}/${record.uri.split("/").pop()}`}
                      className="text-inherit no-underline"
                    >
                      <div className="mb-2 rounded-md border border-gray-300 p-3 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
                        <p className="font-medium">{record.value.character?.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {record.uri.split("/").pop()}
                        </p>
                      </div>
                    </Link>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default View;
