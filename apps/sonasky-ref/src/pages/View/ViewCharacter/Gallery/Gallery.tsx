import { useCallback, useEffect, useMemo, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import type { Client } from "@atcute/client";
import type { ActorIdentifier } from "@atcute/lexicons";
import { ExternalLink, Flag, X } from "lucide-react";
import { Accordion } from "../../../../components/ui/Accordion";
import { Button } from "../../../../components/ui/Button";
import { AnchorIconButton, IconButton } from "../../../../components/ui/IconButton";
import { TextField } from "../../../../components/ui/TextField";
import { Tooltip } from "../../../../components/ui/Tooltip";
import { ASSET_COLLECTION_NS, GALLERY_COLLECTION_NS } from "../../../../const";
import {
  buildImageUrl,
  getUriCollection,
  resolveRefImages,
  type GetRecordFn,
} from "../../../../helpers/resolveImageSource";

function getBlueskyLink(atUri: string): string {
  const [, , did, , rkey] = atUri.split("/");
  return `https://bsky.app/profile/${did}/post/${rkey}`;
}

interface AssetRef {
  uri: string;
  cid: string;
}

interface GalleryEntry {
  recordUri: string;
  source: string;
  artist: string;
  title?: string;
  nsfw: boolean;
  cid: string;
  did: string;
  alt: string;
  createdAt: string;
  recordRef?: AssetRef;
}

interface GallerySlide {
  type: "image";
  src: string;
  alt: string;
  title: string;
  description?: string;
  recordRef?: AssetRef;
  postLink?: string;
}

interface GalleryProps {
  rpc: Client;
  resolvedPdsUrl: string;
  blueskyHandleOrDID: string;
  characterRkey: string;
  canReport: boolean;
  onReportClick: (assetRef: AssetRef) => void;
}

type GalleryTab = "all" | "sfw" | "nsfw";

const NSFW_REVEAL_KEY_PREFIX = "gallery-nsfw-reveal:";
const GALLERY_PAGE_SIZE = 10;

export function Gallery({
  rpc,
  resolvedPdsUrl,
  blueskyHandleOrDID,
  characterRkey,
  canReport,
  onReportClick,
}: GalleryProps) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | undefined>();

  const [activeTab, setActiveTab] = useState<GalleryTab>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedArtists, setSelectedArtists] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(GALLERY_PAGE_SIZE);

  const getRecord = useCallback<GetRecordFn>(
    (params) =>
      rpc.get("com.atproto.repo.getRecord", {
        params: { ...params, repo: params.repo as ActorIdentifier } as any,
      }) as Promise<{ data: { value: any; cid?: string } }>,
    [rpc],
  );

  useEffect(() => {
    let cancelled = false;

    const loadGallery = async () => {
      try {
        const { data } = await rpc.get("com.atproto.repo.listRecords", {
          params: {
            collection: GALLERY_COLLECTION_NS,
            repo: blueskyHandleOrDID as ActorIdentifier,
          },
        });
        const records = (data as any).records.filter(
          (rec: any) => rec.value.characterRkey === characterRkey,
        );
        const resolved = await Promise.all(
          records.map(async (rec: any): Promise<GalleryEntry | undefined> => {
            try {
              const images = await resolveRefImages(getRecord, rec.value.source);
              const img = images[rec.value.sourceImageIndex ?? 0] ?? images[0];
              if (!img) {
                return undefined;
              }
              return {
                alt: rec.value.alt || img.alt || rec.value.title || "Gallery image",
                artist: rec.value.artist,
                cid: img.cid,
                createdAt: rec.value.createdAt ?? "",
                did: img.did,
                nsfw: Boolean(rec.value.nsfw),
                recordRef: img.recordRef,
                recordUri: rec.uri as string,
                source: rec.value.source,
                title: rec.value.title,
              };
            } catch {
              return undefined;
            }
          }),
        );
        if (!cancelled) {
          setEntries(resolved.filter((entry): entry is GalleryEntry => Boolean(entry)));
        }
      } catch (error) {
        console.error("Failed to load gallery", error);
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    };

    void loadGallery();
    return () => {
      cancelled = true;
    };
  }, [rpc, getRecord, blueskyHandleOrDID, characterRkey]);

  const isRevealed = (recordUri: string) => {
    if (revealed.has(recordUri)) {
      return true;
    }
    try {
      return Boolean(localStorage.getItem(`${NSFW_REVEAL_KEY_PREFIX}${recordUri}`));
    } catch {
      return false;
    }
  };

  const handleReveal = (recordUri: string) => {
    setRevealed((prev) => new Set(prev).add(recordUri));
    try {
      localStorage.setItem(`${NSFW_REVEAL_KEY_PREFIX}${recordUri}`, "1");
    } catch {
      // ignore storage errors
    }
  };

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries],
  );
  const sfwEntries = useMemo(() => sorted.filter((e) => !e.nsfw), [sorted]);
  const nsfwEntries = useMemo(() => sorted.filter((e) => e.nsfw), [sorted]);
  const tabEntries = activeTab === "sfw" ? sfwEntries : activeTab === "nsfw" ? nsfwEntries : sorted;

  const availableArtists = useMemo(
    () => Array.from(new Set(tabEntries.map((e) => e.artist))).sort((a, b) => a.localeCompare(b)),
    [tabEntries],
  );

  const toggleArtist = (artist: string) => {
    setSelectedArtists((prev) =>
      prev.includes(artist) ? prev.filter((a) => a !== artist) : [...prev, artist],
    );
  };

  const lowerSearch = searchText.toLowerCase();
  const filtered = useMemo(
    () =>
      tabEntries.filter((entry) => {
        if (lowerSearch) {
          const titleMatch = (entry.title ?? "").toLowerCase().includes(lowerSearch);
          const artistMatch = entry.artist.toLowerCase().includes(lowerSearch);
          if (!titleMatch && !artistMatch) {
            return false;
          }
        }
        if (selectedArtists.length > 0 && !selectedArtists.includes(entry.artist)) {
          return false;
        }
        return true;
      }),
    [tabEntries, lowerSearch, selectedArtists],
  );

  useEffect(() => {
    setLightboxIndex(undefined);
    setVisibleCount(GALLERY_PAGE_SIZE);
  }, [activeTab, searchText, selectedArtists]);

  const filtersActive = searchText !== "" || selectedArtists.length > 0;
  const visibleEntries = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  if (!loaded || entries.length === 0) {
    return null;
  }

  const slides: GallerySlide[] = filtered.map((entry) => ({
    description: entry.title,
    postLink:
      getUriCollection(entry.source) === ASSET_COLLECTION_NS
        ? undefined
        : getBlueskyLink(entry.source),
    recordRef: entry.recordRef,
    src: buildImageUrl(resolvedPdsUrl, entry.recordUri, entry.did, entry.cid, "fullsize"),
    title: entry.artist,
    type: "image",
    alt: entry.alt,
  }));

  return (
    <div className="mb-4 mt-4">
      <Accordion title="Gallery">
        {nsfwEntries.length > 0 && (
          <div className="mb-3 flex gap-2">
            <Button
              type="button"
              variant={activeTab === "all" ? "contained" : "outlined"}
              size="small"
              onClick={() => setActiveTab("all")}
            >
              All ({sorted.length})
            </Button>
            <Button
              type="button"
              variant={activeTab === "sfw" ? "contained" : "outlined"}
              size="small"
              onClick={() => setActiveTab("sfw")}
            >
              SFW ({sfwEntries.length})
            </Button>
            <Button
              type="button"
              variant={activeTab === "nsfw" ? "contained" : "outlined"}
              size="small"
              onClick={() => setActiveTab("nsfw")}
            >
              NSFW ({nsfwEntries.length})
            </Button>
          </div>
        )}
        <div className="mb-3">
          <Button
            type="button"
            variant={filtersActive ? "contained" : "outlined"}
            size="small"
            onClick={() => setShowFilters((f) => !f)}
          >
            {showFilters ? "▾" : "▸"} Filters{filtersActive ? " ●" : ""}
          </Button>
          {showFilters && (
            <div className="mt-2 flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700">
              <TextField
                label="Search titles & artists"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              {availableArtists.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium">Artists</p>
                  <div className="flex flex-wrap gap-2">
                    {availableArtists.map((artist) => {
                      const isSelected = selectedArtists.includes(artist);
                      return (
                        <button
                          key={artist}
                          type="button"
                          onClick={() => toggleArtist(artist)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${
                            isSelected
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                          }`}
                        >
                          {artist}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {filtersActive && (
                <Button
                  type="button"
                  variant="text"
                  size="small"
                  color="error"
                  startIcon={<X size={14} />}
                  className="self-start"
                  onClick={() => {
                    setSearchText("");
                    setSelectedArtists([]);
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filtersActive ? "No gallery images match your filters." : "No gallery images."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {visibleEntries.map((entry, index) => {
              const thumbUrl = buildImageUrl(
                resolvedPdsUrl,
                entry.recordUri,
                entry.did,
                entry.cid,
                "thumbnail",
              );
              const blurred = entry.nsfw && !isRevealed(entry.recordUri);
              return (
                <button
                  key={entry.recordUri}
                  type="button"
                  className="group relative aspect-square overflow-hidden rounded-md"
                  onClick={() => {
                    if (blurred) {
                      handleReveal(entry.recordUri);
                      return;
                    }
                    setLightboxIndex(index);
                  }}
                >
                  <img
                    src={thumbUrl}
                    alt={entry.alt}
                    className={`h-full w-full object-cover transition-transform group-hover:scale-105 ${blurred ? "blur-xl" : ""}`}
                  />
                  {blurred && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-center text-xs text-white">
                      NSFW
                      <br />
                      Click to reveal
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {hasMore && (
          <div className="mt-3 flex justify-center">
            <Button
              type="button"
              variant="outlined"
              size="small"
              onClick={() =>
                setVisibleCount((count) => Math.min(count + GALLERY_PAGE_SIZE, filtered.length))
              }
            >
              Load more
            </Button>
          </div>
        )}
      </Accordion>
      <Lightbox
        open={lightboxIndex !== undefined}
        index={lightboxIndex ?? 0}
        close={() => setLightboxIndex(undefined)}
        slides={slides}
        render={{
          slideFooter: ({ slide }) => {
            const s = slide as GallerySlide;
            return (
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 bg-black/60 px-6 py-3 text-white">
                <p className="text-center text-sm">
                  Art by {s.title}
                  {s.description ? ` - ${s.description}` : ""}
                </p>
                <div className="flex items-center gap-1">
                  {s.postLink && (
                    <Tooltip title="View post on Bluesky">
                      <AnchorIconButton
                        href={s.postLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="small"
                        className="text-white hover:bg-white/20"
                      >
                        <ExternalLink size={16} />
                      </AnchorIconButton>
                    </Tooltip>
                  )}
                  {s.recordRef && (
                    <Tooltip
                      title={canReport ? "Report this image" : "Sign in to report this image"}
                    >
                      <IconButton
                        size="small"
                        className="text-white hover:bg-white/20"
                        onClick={() => onReportClick(s.recordRef as AssetRef)}
                      >
                        <Flag size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                </div>
              </div>
            );
          },
        }}
      />
    </div>
  );
}
