/**
 * The Badges tab: your 88x31 badges. Make one in the badge maker, upload
 * one you already have (animated GIFs stay animated), and copy a badge's
 * link so friends can show it on their sites.
 */

import { useRef, useState } from "react";
import { Copy, Paintbrush, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { BADGE_HEIGHT, BADGE_WIDTH } from "../../../shared/badges.ts";
import type { BadgeEntry, MediaEntry } from "../../../shared/dto.ts";
import { formatBytes, LIMITS } from "../../../shared/limits.ts";
import { NSID_BADGE, NSID_MEDIA } from "../../../shared/nsid.ts";
import { api, ApiFailure } from "../../api.ts";
import { Button, Modal, Notice } from "../../components/ui.tsx";
import { useEditorState } from "../context.tsx";
import { imageSize } from "../MediaLibrary.tsx";
import { BadgeDetailsFields, badgeDetailsError, type BadgeDetails } from "./BadgeDetails.tsx";
import { BadgeMaker, type MakerStart } from "./BadgeMaker.tsx";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/avif";

/** A badge image at 2x, crisp. */
export function BadgeImage({ url, alt, scale = 2 }: { url?: string; alt: string; scale?: number }) {
  return url ? (
    <img
      src={url}
      alt={alt}
      width={BADGE_WIDTH * scale}
      height={BADGE_HEIGHT * scale}
      style={{ imageRendering: "pixelated" }}
      className="block"
      loading="lazy"
    />
  ) : (
    <div
      style={{ width: BADGE_WIDTH * scale, height: BADGE_HEIGHT * scale }}
      className="flex items-center justify-center bg-neutral-100 text-xs text-neutral-500 dark:bg-neutral-800"
    >
      Image deleted
    </div>
  );
}

function UploadBadge({
  onDone,
  onFit,
}: {
  onDone: () => void;
  onFit: (media: MediaEntry, details: BadgeDetails) => void;
}) {
  const { upsertMedia, upsertBadge } = useEditorState();
  const [file, setFile] = useState<File | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | undefined>();
  const [details, setDetails] = useState<BadgeDetails>({ alt: "", noAlt: false, href: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const exact = size?.width === BADGE_WIDTH && size?.height === BADGE_HEIGHT;
  const tooBig = file && file.size > LIMITS.imageBytes;
  const detailsError = badgeDetailsError(details);

  const choose = async (f: File | null) => {
    setFile(f);
    setError(null);
    setSize(f ? await imageSize(f) : undefined);
  };

  const upload = async () => {
    if (!file) throw new Error("No file.");
    const { media } = await api.uploadMedia(file, details.noAlt ? null : details.alt.trim(), size);
    upsertMedia(media);
    return media;
  };

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  /** Upload the file untouched (keeps GIF animation) and make it a badge. */
  const useAsIs = () =>
    run(async () => {
      const media = await upload();
      const res = await api.createBadge({
        media: media.rkey,
        alt: details.noAlt ? "" : details.alt.trim(),
        ...(details.noAlt ? { noAlt: true } : {}),
        href: details.href.trim() || undefined,
      });
      upsertBadge(res.badge);
      onDone();
    });

  const fit = () =>
    run(async () => {
      onFit(await upload(), details);
    });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium" htmlFor="apollo-badge-upload">
          Choose an image
        </label>
        <input
          id="apollo-badge-upload"
          ref={inputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="mt-1 block w-full text-sm"
          onChange={(e) => void choose(e.target.files?.[0] ?? null)}
        />
        <p className="mt-1 text-xs text-neutral-500">
          88x31 PNG, GIF, WebP, JPEG or AVIF, up to {formatBytes(LIMITS.imageBytes)}. Animated GIFs
          and WebPs stay animated.
        </p>
      </div>
      {file && size && !exact ? (
        <Notice tone="warn">
          This picture is {size.width}x{size.height}, not 88x31. Fit it into a badge in the badge
          maker (saved as a still PNG), or use it as it is and it'll be squeezed to 88x31.
        </Notice>
      ) : null}
      {tooBig ? <Notice tone="error">That file is too big.</Notice> : null}
      {file ? <BadgeDetailsFields value={details} onChange={setDetails} /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {file ? (
        <div className="flex flex-wrap gap-2">
          {exact || !size ? (
            <Button
              variant="primary"
              disabled={busy || Boolean(detailsError) || Boolean(tooBig)}
              onClick={useAsIs}
            >
              {busy ? "Uploading..." : "Save badge"}
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                disabled={busy || Boolean(detailsError) || Boolean(tooBig)}
                onClick={fit}
              >
                <Paintbrush size={14} /> Fit in the badge maker
              </Button>
              <Button disabled={busy || Boolean(detailsError) || Boolean(tooBig)} onClick={useAsIs}>
                Use as it is
              </Button>
            </>
          )}
          {detailsError ? (
            <span className="self-center text-xs text-rose-600">{detailsError}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EditDetails({ badge, onDone }: { badge: BadgeEntry; onDone: () => void }) {
  const { upsertBadge } = useEditorState();
  const v = badge.value;
  const [details, setDetails] = useState<BadgeDetails>({
    alt: v.alt,
    noAlt: Boolean(v.noAlt),
    href: v.href ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailsError = badgeDetailsError(details);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.updateBadge(badge.rkey, {
        media: v.media,
        alt: details.noAlt ? "" : details.alt.trim(),
        ...(details.noAlt ? { noAlt: true } : {}),
        href: details.href.trim() || undefined,
        source: v.source,
      });
      upsertBadge(res.badge);
      onDone();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <BadgeDetailsFields value={details} onChange={setDetails} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex gap-2">
        <Button variant="primary" disabled={busy || Boolean(detailsError)} onClick={save}>
          {busy ? "Saving..." : "Save"}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function BadgeCard({
  badge,
  onEdit,
  onEditDetails,
}: {
  badge: BadgeEntry;
  onEdit: () => void;
  onEditDetails: () => void;
}) {
  const { bundle, remove } = useEditorState();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = badge.value;
  const media = bundle.media.find((m) => m.rkey === v.media);

  const copy = () => {
    void navigator.clipboard.writeText(badge.uri).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const del = async () => {
    if (
      !globalThis.confirm(
        "Delete this badge? It disappears from every page showing it, including friends' sites.",
      )
    ) {
      return;
    }
    const sharedImage = bundle.badges.some(
      (b) => b.rkey !== badge.rkey && b.value.media === v.media,
    );
    const alsoImage =
      media && !sharedImage && globalThis.confirm("Also delete its image from Media?");
    setBusy(true);
    try {
      await api.deleteRecord(NSID_BADGE, badge.rkey);
      remove("badges", badge.rkey);
      if (alsoImage) {
        await api.deleteRecord(NSID_MEDIA, v.media);
        remove("media", v.media);
      }
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't delete.");
      setBusy(false);
    }
  };

  return (
    <li className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <BadgeImage url={media?.url} alt={v.alt} />
      <p className="line-clamp-2 text-sm" title={v.alt}>
        {v.alt || <em className="text-neutral-500">No description</em>}
      </p>
      <p className="truncate text-xs text-neutral-500" title={v.href}>
        {v.href ? `Links to ${v.href}` : "No link"}
      </p>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      <div className="flex flex-wrap gap-1">
        <Button size="sm" onClick={onEdit}>
          <Paintbrush size={14} />{" "}
          {v.source && !v.source.pixelEdited ? "Edit design" : "Edit pixels"}
        </Button>
        <Button size="sm" onClick={onEditDetails}>
          <Pencil size={14} /> Details
        </Button>
        <Button
          size="sm"
          onClick={copy}
          title="Friends paste this to show your badge on their site"
        >
          <Copy size={14} /> {copied ? "Copied!" : "Copy share link"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={del}>
          <Trash2 size={14} /> Delete
        </Button>
      </div>
    </li>
  );
}

type Dialog =
  | { kind: "maker"; start: MakerStart }
  | { kind: "upload" }
  | { kind: "details"; badge: BadgeEntry }
  | null;

export function BadgesPanel() {
  const { bundle } = useEditorState();
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const full = bundle.badges.length >= LIMITS.badgesPerSite;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">88x31 badges</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Little 88x31 web buttons, like the ones on old personal sites. Make or upload as many as
          you like, then show them (and your friends') on a page with the “88x31 Badges” block.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={full}
          onClick={() => setDialog({ kind: "maker", start: { kind: "new" } })}
        >
          <Plus size={16} /> Make a badge
        </Button>
        <Button disabled={full} onClick={() => setDialog({ kind: "upload" })}>
          <Upload size={16} /> Upload a badge
        </Button>
      </div>
      {full ? (
        <Notice tone="warn">You've reached the limit of {LIMITS.badgesPerSite} badges.</Notice>
      ) : null}

      {bundle.badges.length === 0 ? (
        <p className="text-sm text-neutral-500">No badges yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bundle.badges.map((b) => (
            <BadgeCard
              key={b.rkey}
              badge={b}
              onEdit={() => setDialog({ kind: "maker", start: { kind: "edit", badge: b } })}
              onEditDetails={() => setDialog({ kind: "details", badge: b })}
            />
          ))}
        </ul>
      )}

      <Modal
        open={dialog?.kind === "maker"}
        onClose={close}
        title={
          dialog?.kind === "maker" && dialog.start.kind === "edit" ? "Edit badge" : "Make a badge"
        }
        wide
      >
        {dialog?.kind === "maker" ? <BadgeMaker start={dialog.start} onDone={close} /> : null}
      </Modal>
      <Modal open={dialog?.kind === "upload"} onClose={close} title="Upload a badge">
        <UploadBadge
          onDone={close}
          onFit={(media, details) =>
            setDialog({ kind: "maker", start: { kind: "fromMedia", media, details } })
          }
        />
      </Modal>
      <Modal open={dialog?.kind === "details"} onClose={close} title="Badge details">
        {dialog?.kind === "details" ? <EditDetails badge={dialog.badge} onDone={close} /> : null}
      </Modal>
    </div>
  );
}
