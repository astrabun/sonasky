import { useRef, useState } from "react";
import type { MediaEntry } from "../../shared/dto.ts";
import { formatBytes, LIMITS } from "../../shared/limits.ts";
import { NSID_MEDIA } from "../../shared/nsid.ts";
import { api, ApiFailure } from "../api.ts";
import { Button, Modal, Notice, TextArea } from "../components/ui.tsx";
import { useEditorState } from "./context.tsx";

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/avif,video/mp4,video/webm";

async function imageSize(file: File): Promise<{ width: number; height: number } | undefined> {
  if (!file.type.startsWith("image/")) return undefined;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return undefined;
  }
}

function isVideo(m: MediaEntry): boolean {
  return m.value.file.mimeType.startsWith("video/");
}

export function MediaThumb({ media, className = "" }: { media: MediaEntry; className?: string }) {
  return isVideo(media) ? (
    <video src={media.url} className={`object-cover ${className}`} muted preload="metadata" />
  ) : (
    <img
      src={media.url}
      alt={media.value.alt}
      className={`object-cover ${className}`}
      loading="lazy"
    />
  );
}

function UploadForm({ onUploaded }: { onUploaded: (m: MediaEntry) => void }) {
  const { upsertMedia } = useEditorState();
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [noAlt, setNoAlt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tooBig =
    file && file.size > (file.type.startsWith("video/") ? LIMITS.videoBytes : LIMITS.imageBytes);

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { media } = await api.uploadMedia(file, noAlt ? null : alt, await imageSize(file));
      upsertMedia(media);
      onUploaded(media);
      setFile(null);
      setAlt("");
      setNoAlt(false);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-neutral-300 p-4 dark:border-neutral-700">
      <div>
        <label className="block text-sm font-medium" htmlFor="apollo-upload">
          Upload an image or video
        </label>
        <input
          id="apollo-upload"
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="mt-1 block w-full text-sm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <p className="mt-1 text-xs text-neutral-500">
          Images up to {formatBytes(LIMITS.imageBytes)}, videos up to{" "}
          {formatBytes(LIMITS.videoBytes)}. PNG, JPEG, GIF, WebP, AVIF, MP4 or WebM.
        </p>
      </div>
      {file ? (
        <div className="space-y-2">
          {noAlt ? (
            <p className="text-xs text-neutral-500">
              No description. People using screen readers won't know what this shows. You can add
              one later in Media.
            </p>
          ) : (
            <TextArea
              label="Describe it for people who can't see it (alt text)"
              help="For example: “A watercolor fox curled up asleep under a tree.”"
              rows={2}
              value={alt}
              maxLength={LIMITS.altBytes}
              onChange={(e) => setAlt(e.target.value)}
            />
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={noAlt}
              onChange={(e) => setNoAlt(e.target.checked)}
            />
            <span>I'm choosing not to add a description</span>
          </label>
        </div>
      ) : null}
      {tooBig ? <Notice tone="error">That file is too big.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="primary"
        disabled={!file || (!noAlt && !alt.trim()) || busy || Boolean(tooBig)}
        onClick={submit}
      >
        {busy ? "Uploading..." : "Upload"}
      </Button>
      <p className="text-xs text-neutral-500">
        Uploads are stored in your Bluesky account and are public, like posts.
      </p>
    </div>
  );
}

function MediaItem({ media, onPick }: { media: MediaEntry; onPick?: (m: MediaEntry) => void }) {
  const { upsertMedia, remove } = useEditorState();
  const [editing, setEditing] = useState(false);
  const [alt, setAlt] = useState(media.value.alt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveAlt = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.updateMediaAlt(media.rkey, alt);
      // Adding a description replaces an earlier "no description" choice.
      const { noAlt: _noAlt, ...rest } = media.value;
      upsertMedia({ ...media, cid: res.cid, value: { ...rest, alt: alt.trim() } });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!globalThis.confirm("Delete this file? Pages using it will show nothing in its place."))
      return;
    setBusy(true);
    try {
      await api.deleteRecord(NSID_MEDIA, media.rkey);
      remove("media", media.rkey);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't delete.");
      setBusy(false);
    }
  };

  return (
    <li className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      <MediaThumb
        media={media}
        className="aspect-square w-full bg-neutral-100 dark:bg-neutral-800"
      />
      <div className="space-y-2 p-2 text-xs">
        {editing ? (
          <>
            <TextArea
              label="Alt text"
              rows={2}
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
            />
            <div className="flex gap-1">
              <Button size="sm" variant="primary" disabled={busy || !alt.trim()} onClick={saveAlt}>
                Save
              </Button>
              <Button size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <p
            className="line-clamp-2 text-neutral-600 dark:text-neutral-300"
            title={media.value.alt}
          >
            {media.value.alt || <em>No description</em>}
          </p>
        )}
        {error ? <p className="text-rose-600">{error}</p> : null}
        {!editing ? (
          <div className="flex flex-wrap gap-1">
            {onPick ? (
              <Button size="sm" variant="primary" onClick={() => onPick(media)}>
                Use this
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setEditing(true)}>
              Edit description
            </Button>
            {!onPick ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={del}>
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function MediaLibrary({
  onPick,
  only,
}: {
  onPick?: (m: MediaEntry) => void;
  /** Restrict to images (e.g. for image blocks and favicons). */
  only?: "image";
}) {
  const { bundle } = useEditorState();
  const media = bundle.media.filter((m) => !only || m.value.file.mimeType.startsWith("image/"));
  return (
    <div className="space-y-4">
      <UploadForm onUploaded={(m) => onPick?.(m)} />
      {media.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing uploaded yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {media.map((m) => (
            <MediaItem key={m.rkey} media={m} onPick={onPick} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Pick an image" control: shows the current choice and opens the library in a modal. */
export function MediaField({
  label,
  value,
  onChange,
  help,
  only = "image",
}: {
  label: string;
  value: string | undefined;
  onChange: (rkey: string | undefined, media?: MediaEntry) => void;
  help?: string;
  only?: "image";
}) {
  const { bundle } = useEditorState();
  const [open, setOpen] = useState(false);
  const current = bundle.media.find((m) => m.rkey === value);
  return (
    <div className="space-y-1">
      <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-200">
        {label}
      </span>
      <div className="flex items-center gap-3">
        {current ? (
          <MediaThumb
            media={current}
            className="h-16 w-16 rounded-md bg-neutral-100 dark:bg-neutral-800"
          />
        ) : value ? (
          <span className="text-xs text-rose-600">The chosen file was deleted.</span>
        ) : null}
        <Button size="sm" onClick={() => setOpen(true)}>
          {value ? "Change" : "Choose..."}
        </Button>
        {value ? (
          <Button size="sm" variant="ghost" onClick={() => onChange(undefined)}>
            Remove
          </Button>
        ) : null}
      </div>
      {help ? <p className="text-xs text-neutral-500 dark:text-neutral-400">{help}</p> : null}
      <Modal open={open} onClose={() => setOpen(false)} title={label} wide>
        <MediaLibrary
          only={only}
          onPick={(m) => {
            onChange(m.rkey, m);
            setOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}
