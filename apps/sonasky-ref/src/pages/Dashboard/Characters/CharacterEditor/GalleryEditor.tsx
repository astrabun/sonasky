import { useCallback, useEffect, useState } from "react";
import { TID } from "@atproto/common-web";
import type { Agent } from "@atproto/api";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { Checkbox, FormControlLabel } from "../../../../components/ui/Checkbox";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "../../../../components/ui/Dialog";
import { AnchorIconButton, IconButton } from "../../../../components/ui/IconButton";
import { TextField } from "../../../../components/ui/TextField";
import {
  ALLOWED_ASSET_MIME_TYPES,
  ASSET_COLLECTION_NS,
  GALLERY_COLLECTION_NS,
} from "../../../../const";
import { validateAssetFile } from "../../../../helpers/validateAssetFile";
import {
  getUriCollection,
  resolvePostImages,
  type GetRecordFn,
  type ResolvedImage,
} from "../../../../helpers/resolveImageSource";

type AddMode = "post" | "upload";

interface GalleryRecord {
  uri: string;
  characterRkey: string;
  source: string;
  sourceImageIndex: number;
  artist: string;
  title?: string;
  alt?: string;
  nsfw: boolean;
}

interface GalleryEditorProps {
  pdsAgent: Agent;
  characterRkey: string;
}

function getBlueskyLink(atUri: string): string {
  const [, , did, , rkey] = atUri.split("/");
  return `https://bsky.app/profile/${did}/post/${rkey}`;
}

async function convertPostUrlToAtUri(pdsAgent: Agent, url: string): Promise<string> {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/");
    if (pathParts.length < 4) {
      return url;
    }
    const [, , handle, , postRkey] = pathParts;
    const { data } = await pdsAgent.com.atproto.identity.resolveHandle({ handle });
    return `at://${data.did}/app.bsky.feed.post/${postRkey}`;
  } catch (error) {
    console.error("Failed to transform Bluesky post URL to at:// URI", error);
    return url;
  }
}

export function GalleryEditor({ pdsAgent, characterRkey }: GalleryEditorProps) {
  const [entries, setEntries] = useState<GalleryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState<AddMode>("post");
  const [postUrl, setPostUrl] = useState("");
  const [postImages, setPostImages] = useState<ResolvedImage[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [perImageAlt, setPerImageAlt] = useState<Record<number, string>>({});
  const [sharedArtist, setSharedArtist] = useState("");
  const [sharedTitle, setSharedTitle] = useState("");
  const [sharedNsfw, setSharedNsfw] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | undefined>();
  const [uploadArtist, setUploadArtist] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadAlt, setUploadAlt] = useState("");
  const [uploadNsfw, setUploadNsfw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [editingEntry, setEditingEntry] = useState<GalleryRecord | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<GalleryRecord | undefined>();

  const getRecord = useCallback<GetRecordFn>(
    (params) => pdsAgent.com.atproto.repo.getRecord(params),
    [pdsAgent],
  );

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await pdsAgent.com.atproto.repo.listRecords({
        collection: GALLERY_COLLECTION_NS,
        repo: pdsAgent.assertDid,
      });
      const records = data.records
        .filter((rec: any) => rec.value.characterRkey === characterRkey)
        .map(
          (rec: any): GalleryRecord => ({
            alt: rec.value.alt,
            artist: rec.value.artist,
            characterRkey: rec.value.characterRkey,
            nsfw: Boolean(rec.value.nsfw),
            source: rec.value.source,
            sourceImageIndex: rec.value.sourceImageIndex ?? 0,
            title: rec.value.title,
            uri: rec.uri,
          }),
        );
      setEntries(records);
    } catch (error) {
      console.error("Failed to load gallery entries", error);
    } finally {
      setLoading(false);
    }
  }, [pdsAgent, characterRkey]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const resetAddForms = () => {
    setPostUrl("");
    setPostImages([]);
    setSelectedIndices(new Set());
    setPerImageAlt({});
    setSharedArtist("");
    setSharedTitle("");
    setSharedNsfw(false);
    setUploadFile(undefined);
    setUploadArtist("");
    setUploadTitle("");
    setUploadAlt("");
    setUploadNsfw(false);
    setValidationMessage("");
  };

  const handleFetchPost = async () => {
    if (!postUrl) {
      return;
    }
    setValidationMessage("");
    const atUri = await convertPostUrlToAtUri(pdsAgent, postUrl);
    if (!atUri.startsWith("at://")) {
      setValidationMessage("Could not resolve that Bluesky post URL");
      return;
    }
    try {
      const images = await resolvePostImages(getRecord, atUri);
      if (images.length === 0) {
        setValidationMessage("No images found in that post");
      }
      setPostUrl(atUri);
      setPostImages(images);
      setSelectedIndices(new Set());
      setPerImageAlt(Object.fromEntries(images.map((img, i) => [i, img.alt])));
    } catch (error) {
      console.error("Failed to fetch post images", error);
      setValidationMessage("Failed to fetch that post. Check the URL and try again.");
    }
  };

  const toggleSelected = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleAddFromPost = async () => {
    if (selectedIndices.size === 0) {
      setValidationMessage("Select at least one image");
      return;
    }
    if (!sharedArtist) {
      setValidationMessage("Artist is required");
      return;
    }
    setSubmitting(true);
    setValidationMessage("");
    try {
      const nowTs = new Date().toISOString();
      for (const index of selectedIndices) {
        const galleryRkey = TID.nextStr();
        await pdsAgent.com.atproto.repo.putRecord({
          collection: GALLERY_COLLECTION_NS,
          record: {
            $type: GALLERY_COLLECTION_NS,
            alt: perImageAlt[index] || undefined,
            artist: sharedArtist,
            characterRkey,
            createdAt: nowTs,
            nsfw: sharedNsfw,
            source: postUrl,
            sourceImageIndex: index,
            title: sharedTitle || undefined,
          },
          repo: pdsAgent.assertDid,
          rkey: galleryRkey,
          validate: false,
        });
      }
      resetAddForms();
      await loadEntries();
    } catch (error) {
      console.error("Failed to add gallery images", error);
      setValidationMessage("Failed to add gallery images. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      setValidationMessage("Choose an image to upload");
      return;
    }
    if (!uploadArtist) {
      setValidationMessage("Artist is required");
      return;
    }
    const { status, message } = validateAssetFile(uploadFile);
    if (!status) {
      setValidationMessage(message);
      return;
    }
    setSubmitting(true);
    setValidationMessage("");
    try {
      const { data: blobData } = await pdsAgent.com.atproto.repo.uploadBlob(uploadFile);
      const assetRkey = TID.nextStr();
      const nowTs = new Date().toISOString();
      await pdsAgent.com.atproto.repo.putRecord({
        collection: ASSET_COLLECTION_NS,
        record: {
          $type: ASSET_COLLECTION_NS,
          alt: uploadAlt,
          createdAt: nowTs,
          image: blobData.blob,
        },
        repo: pdsAgent.assertDid,
        rkey: assetRkey,
        validate: false,
      });
      const assetUri = `at://${pdsAgent.assertDid}/${ASSET_COLLECTION_NS}/${assetRkey}`;
      const galleryRkey = TID.nextStr();
      await pdsAgent.com.atproto.repo.putRecord({
        collection: GALLERY_COLLECTION_NS,
        record: {
          $type: GALLERY_COLLECTION_NS,
          alt: uploadAlt || undefined,
          artist: uploadArtist,
          characterRkey,
          createdAt: nowTs,
          nsfw: uploadNsfw,
          source: assetUri,
          sourceImageIndex: 0,
          title: uploadTitle || undefined,
        },
        repo: pdsAgent.assertDid,
        rkey: galleryRkey,
        validate: false,
      });
      resetAddForms();
      await loadEntries();
    } catch (error) {
      console.error("Failed to upload gallery image", error);
      setValidationMessage("Failed to upload image. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) {
      return;
    }
    if (!editingEntry.artist) {
      setValidationMessage("Artist is required");
      return;
    }
    setSubmitting(true);
    try {
      const rkey = editingEntry.uri.split("/").pop() as string;
      const nowTs = new Date().toISOString();
      await pdsAgent.com.atproto.repo.putRecord({
        collection: GALLERY_COLLECTION_NS,
        record: {
          $type: GALLERY_COLLECTION_NS,
          alt: editingEntry.alt || undefined,
          artist: editingEntry.artist,
          characterRkey: editingEntry.characterRkey,
          createdAt: nowTs,
          nsfw: editingEntry.nsfw,
          source: editingEntry.source,
          sourceImageIndex: editingEntry.sourceImageIndex,
          title: editingEntry.title || undefined,
        },
        repo: pdsAgent.assertDid,
        rkey,
        validate: false,
      });
      setEditingEntry(undefined);
      await loadEntries();
    } catch (error) {
      console.error("Failed to update gallery image", error);
      setValidationMessage("Failed to save changes. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (entry: GalleryRecord) => {
    try {
      const rkey = entry.uri.split("/").pop() as string;
      await pdsAgent.com.atproto.repo.deleteRecord({
        collection: GALLERY_COLLECTION_NS,
        repo: pdsAgent.assertDid,
        rkey,
      });
      if (getUriCollection(entry.source) === ASSET_COLLECTION_NS) {
        const [, , assetDid, , assetRkey] = entry.source.split("/");
        if (assetDid === pdsAgent.assertDid) {
          await pdsAgent.com.atproto.repo.deleteRecord({
            collection: ASSET_COLLECTION_NS,
            repo: pdsAgent.assertDid,
            rkey: assetRkey,
          });
        }
      }
      setDeleteTarget(undefined);
      await loadEntries();
    } catch (error) {
      console.error("Failed to delete gallery image", error);
    }
  };

  return (
    <div>
      <h5 className="mb-2 text-lg font-semibold">Gallery</h5>
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        Add other art of this character, sourced from a Bluesky post or uploaded directly.
      </p>
      {loading ? (
        <p className="text-sm">Loading gallery...</p>
      ) : (
        entries.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {entries.map((entry) => {
              return (
                <div key={entry.uri} className="relative">
                  <button
                    type="button"
                    className="h-24 w-full overflow-hidden rounded border"
                    onClick={() => setEditingEntry(entry)}
                  >
                    <GalleryThumb pdsAgent={pdsAgent} getRecord={getRecord} entry={entry} />
                  </button>
                  {getUriCollection(entry.source) !== ASSET_COLLECTION_NS && (
                    <AnchorIconButton
                      href={getBlueskyLink(entry.source)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      size="small"
                      className="absolute left-1 top-1 bg-white/80 dark:bg-gray-900/80"
                    >
                      <ExternalLink size={16} />
                    </AnchorIconButton>
                  )}
                  <IconButton
                    size="small"
                    className="absolute right-1 top-1 bg-white/80 dark:bg-gray-900/80"
                    onClick={() => setDeleteTarget(entry)}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              );
            })}
          </div>
        )
      )}
      <div className="mb-2 flex gap-2">
        <Button
          type="button"
          variant={addMode === "post" ? "contained" : "outlined"}
          size="small"
          onClick={() => setAddMode("post")}
        >
          Add from a Bluesky Post
        </Button>
        <Button
          type="button"
          variant={addMode === "upload" ? "contained" : "outlined"}
          size="small"
          onClick={() => setAddMode("upload")}
        >
          Upload an Image
        </Button>
      </div>
      {addMode === "post" ? (
        <div>
          <div className="flex items-center gap-2">
            <TextField
              label="Bluesky Post (URL)"
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              className="flex-1"
            />
            <Button type="button" onClick={() => void handleFetchPost()} className="mt-6">
              Fetch
            </Button>
          </div>
          {postImages.length > 0 && (
            <>
              <div className="mt-2 flex flex-wrap gap-2">
                {postImages.map((img, index) => {
                  const isSelected = selectedIndices.has(index);
                  return (
                    <div
                      key={`${img.did}/${img.cid}`}
                      className={`h-20 w-20 cursor-pointer overflow-hidden rounded border-[3px] ${
                        isSelected ? "border-blue-600" : "border-transparent"
                      }`}
                      onClick={() => toggleSelected(index)}
                    >
                      <img
                        src={`https://cdn.bsky.app/img/feed_thumbnail/plain/${img.did}/${img.cid}@jpeg`}
                        alt={`Image ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  );
                })}
              </div>
              <TextField
                label="Artist"
                value={sharedArtist}
                onChange={(e) => setSharedArtist(e.target.value)}
                maxLength={256}
                required
                className="mt-2"
              />
              <TextField
                label="Title (optional)"
                value={sharedTitle}
                onChange={(e) => setSharedTitle(e.target.value)}
                maxLength={128}
                className="mt-2"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={sharedNsfw}
                    onChange={(e) => setSharedNsfw(e.target.checked)}
                  />
                }
                label="NSFW"
                className="mt-2"
              />
              <Button
                type="button"
                variant="contained"
                color="primary"
                className="mt-2"
                disabled={submitting}
                onClick={() => void handleAddFromPost()}
              >
                Add Selected Images
              </Button>
            </>
          )}
        </div>
      ) : (
        <div>
          <input
            type="file"
            accept={ALLOWED_ASSET_MIME_TYPES.join(",")}
            onChange={(e) => setUploadFile(e.target.files?.[0])}
          />
          <TextField
            label="Artist"
            value={uploadArtist}
            onChange={(e) => setUploadArtist(e.target.value)}
            maxLength={256}
            required
            className="mt-2"
          />
          <TextField
            label="Title (optional)"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            maxLength={128}
            className="mt-2"
          />
          <TextField
            label="Alt Text (optional)"
            value={uploadAlt}
            onChange={(e) => setUploadAlt(e.target.value)}
            maxLength={2000}
            className="mt-2"
          />
          <FormControlLabel
            control={
              <Checkbox checked={uploadNsfw} onChange={(e) => setUploadNsfw(e.target.checked)} />
            }
            label="NSFW"
            className="mt-2"
          />
          <Button
            type="button"
            variant="contained"
            color="primary"
            className="mt-2"
            disabled={submitting}
            onClick={() => void handleUpload()}
          >
            Add to Gallery
          </Button>
        </div>
      )}
      {validationMessage && <p className="mt-2 text-sm text-red-600">{validationMessage}</p>}
      <Dialog open={Boolean(editingEntry)} onClose={() => setEditingEntry(undefined)}>
        <DialogTitle>Edit Gallery Image</DialogTitle>
        <DialogContent>
          {editingEntry && (
            <div className="flex flex-col gap-2">
              <TextField
                label="Artist"
                value={editingEntry.artist}
                onChange={(e) =>
                  setEditingEntry((prev) => (prev ? { ...prev, artist: e.target.value } : prev))
                }
                maxLength={256}
                required
              />
              <TextField
                label="Title (optional)"
                value={editingEntry.title ?? ""}
                onChange={(e) =>
                  setEditingEntry((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                }
                maxLength={128}
              />
              <TextField
                label="Alt Text (optional)"
                value={editingEntry.alt ?? ""}
                onChange={(e) =>
                  setEditingEntry((prev) => (prev ? { ...prev, alt: e.target.value } : prev))
                }
                maxLength={2000}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={editingEntry.nsfw}
                    onChange={(e) =>
                      setEditingEntry((prev) => (prev ? { ...prev, nsfw: e.target.checked } : prev))
                    }
                  />
                }
                label="NSFW"
              />
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingEntry(undefined)} color="primary">
            Cancel
          </Button>
          <Button onClick={() => void handleSaveEdit()} color="primary" disabled={submitting}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)}>
        <DialogTitle>Delete Gallery Image</DialogTitle>
        <DialogContent>
          <p>This action is permanent and cannot be undone.</p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(undefined)} color="primary">
            Cancel
          </Button>
          <Button onClick={() => deleteTarget && void handleDelete(deleteTarget)} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

function GalleryThumb({
  pdsAgent,
  getRecord,
  entry,
}: {
  pdsAgent: Agent;
  getRecord: GetRecordFn;
  entry: GalleryRecord;
}) {
  const [previewUrl, setPreviewUrl] = useState<string>("");

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
          const blob = await pdsAgent.com.atproto.sync.getBlob({ did, cid });
          if (!cancelled) {
            setPreviewUrl(URL.createObjectURL(new Blob([new Uint8Array(blob.data)])));
          }
        } else {
          const images: ResolvedImage[] = await resolvePostImages(getRecord, entry.source);
          const img = images[entry.sourceImageIndex] ?? images[0];
          if (img && !cancelled) {
            setPreviewUrl(
              `https://cdn.bsky.app/img/feed_thumbnail/plain/${img.did}/${img.cid}@jpeg`,
            );
          }
        }
      } catch {
        // Silently skip if source is inaccessible
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdsAgent, getRecord, entry.source, entry.sourceImageIndex]);

  if (!previewUrl) {
    return <div className="h-full w-full animate-pulse bg-gray-200 dark:bg-gray-800" />;
  }

  return (
    <img
      src={previewUrl}
      alt={entry.alt || entry.title || "Gallery image"}
      className="h-full w-full object-cover"
    />
  );
}
