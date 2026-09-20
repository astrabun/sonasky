import Layout from "../../../layouts/Dashboard";
import type { Agent } from "@atproto/api";
import { Button } from "../../../components/ui/Button";
import { IconButton } from "../../../components/ui/IconButton";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "../../../components/ui/Dialog";
import { Spinner } from "../../../components/ui/Spinner";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthContext } from "../../../auth/auth-provider";
import { ASSET_COLLECTION_NS, GALLERY_COLLECTION_NS, PDS_COLLECTION_NS } from "../../../const";
import { getUriCollection, resolvePostImages } from "../../../helpers/resolveImageSource";

interface CharacterItem {
  rkey: string;
  uri: string;
  name: string;
  refSheet?: string;
  altRef?: string;
  createdAt?: string;
  raw: any;
}

interface GalleryItem {
  rkey: string;
  uri: string;
  characterRkey: string;
  title?: string;
  artist?: string;
  alt?: string;
  source: string;
  createdAt?: string;
}

interface AssetItem {
  rkey: string;
  uri: string;
  alt?: string;
  cid?: string;
  createdAt?: string;
}

function AssetThumbnail({
  pdsAgent,
  did,
  cid,
  alt,
}: {
  pdsAgent: Agent;
  did: string;
  cid?: string;
  alt?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!cid) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const blob = await pdsAgent.com.atproto.sync.getBlob({ cid, did });
        if (!cancelled) {
          setPreviewUrl(URL.createObjectURL(new Blob([new Uint8Array(blob.data)])));
        }
      } catch {
        // Blob may be inaccessible; skip preview
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdsAgent, did, cid]);

  if (!previewUrl) {
    return (
      <div className="h-14 w-14 shrink-0 animate-pulse rounded border border-gray-300 bg-gray-200 dark:border-gray-600 dark:bg-gray-800" />
    );
  }

  return (
    <a
      href={previewUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block h-14 w-14 shrink-0 overflow-hidden rounded border border-gray-300 dark:border-gray-600"
    >
      <img src={previewUrl} alt={alt ?? ""} className="h-full w-full object-cover" />
    </a>
  );
}

function GalleryThumbnail({ pdsAgent, entry }: { pdsAgent: Agent; entry: GalleryItem }) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (getUriCollection(entry.source) === ASSET_COLLECTION_NS) {
          const [, , did, , assetRkey] = entry.source.split("/");
          const record = await pdsAgent.com.atproto.repo.getRecord({
            collection: ASSET_COLLECTION_NS,
            repo: did,
            rkey: assetRkey,
          });
          const cid = (record.data.value as any)?.image?.ref?.toString();
          if (!cid) {
            return;
          }
          const blob = await pdsAgent.com.atproto.sync.getBlob({ cid, did });
          if (!cancelled) {
            setPreviewUrl(URL.createObjectURL(new Blob([new Uint8Array(blob.data)])));
          }
        } else {
          const images = await resolvePostImages(
            (params) => pdsAgent.com.atproto.repo.getRecord(params),
            entry.source,
          );
          const img = images[0];
          if (img && !cancelled) {
            setPreviewUrl(
              `https://cdn.bsky.app/img/feed_thumbnail/plain/${img.did}/${img.cid}@jpeg`,
            );
          }
        }
      } catch {
        // Source may be inaccessible; skip preview
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdsAgent, entry.source]);

  if (!previewUrl) {
    return (
      <div className="h-14 w-14 shrink-0 animate-pulse rounded border border-gray-300 bg-gray-200 dark:border-gray-600 dark:bg-gray-800" />
    );
  }

  return (
    <a
      href={previewUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block h-14 w-14 shrink-0 overflow-hidden rounded border border-gray-300 dark:border-gray-600"
    >
      <img
        src={previewUrl}
        alt={entry.alt ?? entry.title ?? ""}
        className="h-full w-full object-cover"
      />
    </a>
  );
}

interface PendingAction {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<void>;
}

function rkeyOf(uri: string): string {
  return uri.split("/").pop() as string;
}

function formatDate(iso: string | undefined): string {
  if (!iso) {
    return "Unknown date";
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
}

export function ManageData() {
  const { pdsAgent } = useAuthContext();
  const [loading, setLoading] = useState(true);
  const [operationRunning, setOperationRunning] = useState(false);
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [galleryEntries, setGalleryEntries] = useState<GalleryItem[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | undefined>();

  const isOwnedAssetUri = useCallback(
    (uri: string | undefined): uri is string =>
      !!uri &&
      uri.startsWith("at://") &&
      getUriCollection(uri) === ASSET_COLLECTION_NS &&
      uri.split("/")[2] === pdsAgent.assertDid,
    [pdsAgent],
  );

  const loadAllData = useCallback(async () => {
    setLoading(true);
    const [characterRes, galleryRes, assetRes] = await Promise.all([
      pdsAgent.com.atproto.repo.listRecords({
        collection: PDS_COLLECTION_NS,
        repo: pdsAgent.assertDid,
      }),
      pdsAgent.com.atproto.repo.listRecords({
        collection: GALLERY_COLLECTION_NS,
        repo: pdsAgent.assertDid,
      }),
      pdsAgent.com.atproto.repo.listRecords({
        collection: ASSET_COLLECTION_NS,
        repo: pdsAgent.assertDid,
      }),
    ]);
    setCharacters(
      characterRes.data.records.map((rec: any) => ({
        altRef: rec.value.character?.altRef,
        createdAt: rec.value.createdAt,
        name: rec.value.character?.name ?? "Untitled character",
        raw: rec.value,
        refSheet: rec.value.character?.refSheet,
        rkey: rkeyOf(rec.uri),
        uri: rec.uri,
      })),
    );
    setGalleryEntries(
      galleryRes.data.records.map((rec: any) => ({
        alt: rec.value.alt,
        artist: rec.value.artist,
        characterRkey: rec.value.characterRkey,
        createdAt: rec.value.createdAt,
        rkey: rkeyOf(rec.uri),
        source: rec.value.source,
        title: rec.value.title,
        uri: rec.uri,
      })),
    );
    setAssets(
      assetRes.data.records.map((rec: any) => ({
        alt: rec.value.alt,
        cid: rec.value.image?.ref?.toString(),
        createdAt: rec.value.createdAt,
        rkey: rkeyOf(rec.uri),
        uri: rec.uri,
      })),
    );
    setLoading(false);
  }, [pdsAgent]);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  const characterByRkey = useMemo(() => {
    const map = new Map<string, CharacterItem>();
    characters.forEach((c) => map.set(c.rkey, c));
    return map;
  }, [characters]);

  const assetUsage = useMemo(() => {
    const usage = new Map<string, string[]>();
    const addUsage = (uri: string | undefined, label: string) => {
      if (!isOwnedAssetUri(uri)) {
        return;
      }
      const rkey = rkeyOf(uri);
      const existing = usage.get(rkey) ?? [];
      existing.push(label);
      usage.set(rkey, existing);
    };
    characters.forEach((c) => {
      addUsage(c.refSheet, `${c.name} (ref sheet)`);
      addUsage(c.altRef, `${c.name} (alt ref)`);
    });
    galleryEntries.forEach((g) => {
      const characterName = characterByRkey.get(g.characterRkey)?.name ?? "Unknown character";
      addUsage(g.source, `${characterName} gallery: ${g.title ?? "untitled"}`);
    });
    return usage;
  }, [characters, galleryEntries, characterByRkey, isOwnedAssetUri]);

  // -- low-level record deletes --

  const deleteCharacterRecord = (rkey: string) =>
    pdsAgent.com.atproto.repo.deleteRecord({
      collection: PDS_COLLECTION_NS,
      repo: pdsAgent.assertDid,
      rkey,
    });

  const deleteGalleryRecord = (rkey: string) =>
    pdsAgent.com.atproto.repo.deleteRecord({
      collection: GALLERY_COLLECTION_NS,
      repo: pdsAgent.assertDid,
      rkey,
    });

  const deleteAssetRecord = (rkey: string) =>
    pdsAgent.com.atproto.repo.deleteRecord({
      collection: ASSET_COLLECTION_NS,
      repo: pdsAgent.assertDid,
      rkey,
    });

  const unlinkAssetFromCharacter = async (character: CharacterItem, assetUri: string) => {
    const updatedCharacter = { ...character.raw.character };
    let changed = false;
    if (updatedCharacter.refSheet === assetUri) {
      delete updatedCharacter.refSheet;
      delete updatedCharacter.refSheetImageIndex;
      changed = true;
    }
    if (updatedCharacter.altRef === assetUri) {
      delete updatedCharacter.altRef;
      delete updatedCharacter.altRefImageIndex;
      changed = true;
    }
    if (!changed) {
      return;
    }
    await pdsAgent.com.atproto.repo.putRecord({
      collection: PDS_COLLECTION_NS,
      record: {
        $type: PDS_COLLECTION_NS,
        character: updatedCharacter,
        createdAt: character.raw.createdAt,
        modifiedAt: new Date().toISOString(),
      },
      repo: pdsAgent.assertDid,
      rkey: character.rkey,
      validate: false,
    });
  };

  // -- cascading operations (each assumes it owns the current snapshot) --

  const removeGalleryEntry = async (entry: GalleryItem) => {
    await deleteGalleryRecord(entry.rkey);
    if (isOwnedAssetUri(entry.source)) {
      const stillUsed =
        characters.some((c) => c.refSheet === entry.source || c.altRef === entry.source) ||
        galleryEntries.some((g) => g.rkey !== entry.rkey && g.source === entry.source);
      if (!stillUsed) {
        await deleteAssetRecord(rkeyOf(entry.source));
      }
    }
  };

  const removeCharacter = async (character: CharacterItem) => {
    const ownGallery = galleryEntries.filter((g) => g.characterRkey === character.rkey);
    await Promise.all(ownGallery.map((g) => deleteGalleryRecord(g.rkey)));
    await deleteCharacterRecord(character.rkey);
    const candidateUris = [
      ...new Set(
        [character.refSheet, character.altRef, ...ownGallery.map((g) => g.source)].filter(
          isOwnedAssetUri,
        ),
      ),
    ];
    const ownGalleryRkeys = new Set(ownGallery.map((g) => g.rkey));
    await Promise.all(
      candidateUris
        .filter((uri) => {
          const usedByOtherCharacter = characters.some(
            (c) => c.rkey !== character.rkey && (c.refSheet === uri || c.altRef === uri),
          );
          const usedByOtherGallery = galleryEntries.some(
            (g) => !ownGalleryRkeys.has(g.rkey) && g.source === uri,
          );
          return !usedByOtherCharacter && !usedByOtherGallery;
        })
        .map((uri) => deleteAssetRecord(rkeyOf(uri))),
    );
  };

  const removeAsset = async (asset: AssetItem) => {
    const referencingCharacters = characters.filter(
      (c) => c.refSheet === asset.uri || c.altRef === asset.uri,
    );
    await Promise.all(referencingCharacters.map((c) => unlinkAssetFromCharacter(c, asset.uri)));
    const referencingGallery = galleryEntries.filter((g) => g.source === asset.uri);
    await Promise.all(referencingGallery.map((g) => deleteGalleryRecord(g.rkey)));
    await deleteAssetRecord(asset.rkey);
  };

  const clearAllCharacters = async () => {
    await Promise.all(galleryEntries.map((g) => deleteGalleryRecord(g.rkey)));
    await Promise.all(characters.map((c) => deleteCharacterRecord(c.rkey)));
    const assetUris = [
      ...new Set(
        [
          ...characters.flatMap((c) => [c.refSheet, c.altRef]),
          ...galleryEntries.map((g) => g.source),
        ].filter(isOwnedAssetUri),
      ),
    ];
    await Promise.all(assetUris.map((uri) => deleteAssetRecord(rkeyOf(uri))));
  };

  const clearAllGallery = async () => {
    await Promise.all(galleryEntries.map((g) => deleteGalleryRecord(g.rkey)));
    const orphanedAssetUris = [...new Set(galleryEntries.map((g) => g.source))].filter(
      (uri) =>
        isOwnedAssetUri(uri) && !characters.some((c) => c.refSheet === uri || c.altRef === uri),
    );
    await Promise.all(orphanedAssetUris.map((uri) => deleteAssetRecord(rkeyOf(uri))));
  };

  const clearAllAssets = async () => {
    await Promise.all(
      characters
        .filter((c) => isOwnedAssetUri(c.refSheet) || isOwnedAssetUri(c.altRef))
        .flatMap((c) => {
          const uris = [c.refSheet, c.altRef].filter(isOwnedAssetUri);
          return uris.map((uri) => unlinkAssetFromCharacter(c, uri));
        }),
    );
    await Promise.all(
      galleryEntries
        .filter((g) => isOwnedAssetUri(g.source))
        .map((g) => deleteGalleryRecord(g.rkey)),
    );
    await Promise.all(assets.map((a) => deleteAssetRecord(a.rkey)));
  };

  const clearEverything = async () => {
    await Promise.all(galleryEntries.map((g) => deleteGalleryRecord(g.rkey)));
    await Promise.all(characters.map((c) => deleteCharacterRecord(c.rkey)));
    await Promise.all(assets.map((a) => deleteAssetRecord(a.rkey)));
  };

  const runAction = async (action: PendingAction) => {
    setOperationRunning(true);
    try {
      await action.run();
      await loadAllData();
    } finally {
      setOperationRunning(false);
      setPendingAction(undefined);
    }
  };

  const totalRecords = characters.length + galleryEntries.length + assets.length;

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-2xl font-semibold">Manage Data</h4>
          <Button
            variant="contained"
            color="error"
            disabled={totalRecords === 0}
            onClick={() =>
              setPendingAction({
                confirmLabel: "Delete Everything",
                description:
                  "This is a non-reversible action that will delete all SonaSky REF data (characters, gallery images, and assets) from your Bluesky account. SonaSky does not keep any of your data - it all lives within your Bluesky account - so all this does is delete SonaSky REF data from your profile.",
                run: clearEverything,
                title: "Clear All SonaSky REF Data",
              })
            }
          >
            Clear All SonaSky REF Data
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size={24} />
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h5 className="text-lg font-semibold">Characters ({characters.length})</h5>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  disabled={characters.length === 0}
                  onClick={() =>
                    setPendingAction({
                      confirmLabel: "Clear Characters",
                      description:
                        "This will delete all your characters, along with their gallery images and any assets that are only used by them.",
                      run: clearAllCharacters,
                      title: "Clear All Characters",
                    })
                  }
                >
                  Clear All Characters
                </Button>
              </div>
              {characters.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No characters found.</p>
              ) : (
                <div className="divide-y rounded-md border border-gray-300 dark:border-gray-600">
                  {characters.map((character) => (
                    <div key={character.rkey} className="flex items-center justify-between p-3">
                      <div>
                        <p className="font-medium">{character.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(character.createdAt)}
                        </p>
                      </div>
                      <IconButton
                        size="small"
                        onClick={() =>
                          setPendingAction({
                            confirmLabel: "Delete Character",
                            description: `This will delete "${character.name}", along with its gallery images and any assets only used by it.`,
                            run: () => removeCharacter(character),
                            title: "Delete Character",
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h5 className="text-lg font-semibold">Gallery Images ({galleryEntries.length})</h5>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  disabled={galleryEntries.length === 0}
                  onClick={() =>
                    setPendingAction({
                      confirmLabel: "Clear Gallery Images",
                      description:
                        "This will delete all gallery images across all characters, along with any uploaded assets that are only used as gallery sources.",
                      run: clearAllGallery,
                      title: "Clear All Gallery Images",
                    })
                  }
                >
                  Clear All Gallery Images
                </Button>
              </div>
              {galleryEntries.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No gallery images found.</p>
              ) : (
                <div className="divide-y rounded-md border border-gray-300 dark:border-gray-600">
                  {galleryEntries.map((entry) => (
                    <div key={entry.rkey} className="flex items-center gap-3 p-3">
                      <GalleryThumbnail pdsAgent={pdsAgent} entry={entry} />
                      <div className="flex-1">
                        <p className="font-medium">{entry.title ?? "Untitled"}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {entry.artist ? `by ${entry.artist} - ` : ""}
                          {formatDate(entry.createdAt)}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Belongs to:{" "}
                          {characterByRkey.get(entry.characterRkey)?.name ?? "Unknown character"}
                        </p>
                      </div>
                      <IconButton
                        size="small"
                        onClick={() =>
                          setPendingAction({
                            confirmLabel: "Delete Gallery Image",
                            description: `This will delete the gallery image "${entry.title ?? "Untitled"}"${
                              isOwnedAssetUri(entry.source)
                                ? " and its uploaded asset, if unused elsewhere"
                                : ""
                            }.`,
                            run: () => removeGalleryEntry(entry),
                            title: "Delete Gallery Image",
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h5 className="text-lg font-semibold">
                  Uploaded Assets (Non-Bluesky-Posts) ({assets.length})
                </h5>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  disabled={assets.length === 0}
                  onClick={() =>
                    setPendingAction({
                      confirmLabel: "Clear Assets",
                      description:
                        "This will delete all uploaded assets. Any character ref sheets or gallery images using them will be unlinked or removed as needed.",
                      run: clearAllAssets,
                      title: "Clear All Assets",
                    })
                  }
                >
                  Clear All Assets
                </Button>
              </div>
              {assets.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No assets found.</p>
              ) : (
                <div className="divide-y rounded-md border border-gray-300 dark:border-gray-600">
                  {assets.map((asset) => {
                    const usedBy = assetUsage.get(asset.rkey) ?? [];
                    return (
                      <div key={asset.rkey} className="flex items-center gap-3 p-3">
                        <AssetThumbnail
                          pdsAgent={pdsAgent}
                          did={pdsAgent.assertDid}
                          cid={asset.cid}
                          alt={asset.alt}
                        />
                        <div className="flex-1">
                          <p className="font-medium">{asset.alt || "(no alt text)"}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {formatDate(asset.createdAt)}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {usedBy.length > 0 ? `Used by: ${usedBy.join(", ")}` : "Unused"}
                          </p>
                        </div>
                        <IconButton
                          size="small"
                          onClick={() =>
                            setPendingAction({
                              confirmLabel: "Delete Asset",
                              description:
                                usedBy.length > 0
                                  ? `This asset is used by: ${usedBy.join(", ")}. Deleting it will unlink it from those characters and remove any gallery images that use it.`
                                  : "This will delete the unused asset.",
                              run: () => removeAsset(asset),
                              title: "Delete Asset",
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        <Dialog open={!!pendingAction} onClose={() => setPendingAction(undefined)}>
          <DialogTitle>{pendingAction?.title}</DialogTitle>
          <DialogContent>
            <DialogContentText>{pendingAction?.description}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setPendingAction(undefined)}
              color="primary"
              disabled={operationRunning}
            >
              Cancel
            </Button>
            <Button
              onClick={() => pendingAction && void runAction(pendingAction)}
              color="error"
              disabled={operationRunning}
              startIcon={operationRunning ? <Spinner size={20} /> : undefined}
            >
              {operationRunning ? "Deleting..." : pendingAction?.confirmLabel}
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    </Layout>
  );
}
