import { Link, useParams } from "react-router";
import Layout from "../../layouts/View";
import { useCallback, useEffect, useState } from "react";
import { Client, CredentialManager } from "@atcute/client";
import type {} from "@atcute/atproto";
import type { ActorIdentifier, Handle } from "@atcute/lexicons";
import { HANDLE_RESOLVER_URL, LABELER_DIDS } from "../../const";
import { getPds } from "../../helpers/getPds";
import { fetchAccountLabels } from "../../helpers/fetchAccountLabels";
import { fetchLabelerProfiles, type LabelerProfile } from "../../helpers/fetchLabelerProfiles";
import { getAllLabels } from "@sonasky/labels-def";
import { Chip } from "../../components/ui/Chip";

const LABEL_NAMES = new Map(
  getAllLabels().map((label) => [
    label.id,
    label.locales.find((locale) => locale.lang === "en")?.name ?? label.id,
  ]),
);

const LABELER_COLORS = [
  "bg-sky-600 text-white",
  "bg-fuchsia-600 text-white",
  "bg-emerald-600 text-white",
  "bg-amber-600 text-white",
];

const colorForLabeler = (src: string): string => {
  const index = LABELER_DIDS.indexOf(src);
  return LABELER_COLORS[index >= 0 ? index % LABELER_COLORS.length : 0];
};

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
  const [pdsResolved, setPdsResolved] = useState<boolean>(false);

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
      setPdsResolved(true);
    }
  };

  useEffect(() => {
    void handleGetPds();
  }, [did]);

  const [minLoadingTimePassed, setMinLoadingTimePassed] = useState<boolean>(false);

  const [profile, setProfile] = useState<any>();
  const loadProfile = useCallback(async () => {
    if (did && !did.startsWith(UNKNOWN_ERROR)) {
      await rpc
        .get("com.atproto.repo.getRecord", {
          params: {
            collection: "app.bsky.actor.profile",
            repo: did as ActorIdentifier,
            rkey: "self",
          },
        })
        .then((response) => {
          setProfile((response.data as any).value);
        })
        .catch(() => {
          // Profile record may not exist
        });
    }
  }, [did, rpc]);
  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const [accountLabels, setAccountLabels] = useState<{ val: string; src: string }[]>([]);
  const loadAccountLabels = useCallback(async () => {
    if (did && !did.startsWith(UNKNOWN_ERROR)) {
      const labels = await fetchAccountLabels(LABELER_DIDS, did);
      setAccountLabels(labels);
    }
  }, [did]);
  useEffect(() => {
    void loadAccountLabels();
  }, [loadAccountLabels]);

  const [labelerProfiles, setLabelerProfiles] = useState<Map<string, LabelerProfile>>(new Map());
  useEffect(() => {
    void fetchLabelerProfiles(LABELER_DIDS).then(setLabelerProfiles);
  }, []);

  const [sonaRecords, setSonaRecords] = useState<any>();
  const loadSonaRecords = useCallback(async () => {
    if (did && handle && !handle.startsWith(UNKNOWN_ERROR)) {
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
  }, [did, handle, rpc]);
  useEffect(() => {
    void loadSonaRecords();
  }, [loadSonaRecords]);

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
      /* We already have the DID from the URL. Handle/repoData are resolved
              in the second effect below, once handleGetPds updates rpc to the
              account's actual PDS (describeRepo is PDS-hosted, so it can't be
              called against the default entryway for arbitrary accounts). */
      setDid(blueskyHandleOrDID);
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
    if (pdsResolved && did && !did.startsWith(UNKNOWN_ERROR) && !handle) {
      void rpc
        .get("com.atproto.repo.describeRepo", {
          params: { repo: did as ActorIdentifier },
        })
        .then((response) => {
          const { data } = response;
          if (data) {
            setHandle((data as any).handle);
          } else {
            handleLookupError(new Error("describeRepo returned no data"));
          }
        })
        .catch((error) => {
          handleLookupError(error);
        });
    }
  }, [handle, did, rpc, pdsResolved]);

  useEffect(() => {
    if (minLoadingTimePassed && lookupMode === "did" && handle && handle !== UNKNOWN_ERROR) {
      setLoading(false);
    }
  }, [lookupMode, handle, minLoadingTimePassed]);

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
              <div className="flex items-center gap-4">
                {profile?.avatar?.ref?.$link && (
                  <a
                    href={`https://bsky.app/profile/${handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-inherit no-underline"
                  >
                    <img
                      src={`https://cdn.bsky.app/img/avatar_thumbnail/plain/${did}/${profile.avatar.ref.$link}@jpeg`}
                      alt=""
                      className="h-16 w-16 rounded-full sm:h-20 sm:w-20"
                    />
                  </a>
                )}
                <div>
                  {profile?.displayName && (
                    <a
                      href={`https://bsky.app/profile/${handle}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-inherit no-underline"
                    >
                      <p className="text-xl font-semibold sm:text-2xl">{profile.displayName}</p>
                    </a>
                  )}
                  <a
                    href={`https://bsky.app/profile/${handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-inherit no-underline"
                  >
                    <p className="text-2xl sm:text-4xl">@{handle}</p>
                    <p className="ml-8 text-xs">{did}</p>
                  </a>
                </div>
              </div>
              {profile?.description && (
                <p className="mt-2 whitespace-pre-wrap">{profile.description}</p>
              )}
              {accountLabels.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  Labels:{" "}
                  {accountLabels.map((label) => {
                    const labelerProfile = labelerProfiles.get(label.src);
                    return (
                      <a
                        key={`${label.src}:${label.val}`}
                        href={`https://sonasky.app/?id=${encodeURIComponent(label.val)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-inherit no-underline hover:opacity-80"
                      >
                        <Chip
                          label={LABEL_NAMES.get(label.val) ?? label.val}
                          colorClassName={colorForLabeler(label.src)}
                          icon={
                            labelerProfile?.avatarUrl ? (
                              <img
                                src={labelerProfile.avatarUrl}
                                alt={labelerProfile.displayName ?? ""}
                                title={labelerProfile.displayName}
                                className="h-4 w-4 rounded-full"
                              />
                            ) : undefined
                          }
                        />
                      </a>
                    );
                  })}
                </div>
              )}
              {altPds && <p className="ml-8 text-xs mt-4 mb-4">PDS: {altPds}</p>}
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
