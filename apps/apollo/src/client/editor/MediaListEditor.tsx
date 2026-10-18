/** A list of uploaded pictures with their descriptions (Gallery and community blocks). */

import { useState } from "react";
import { Plus } from "lucide-react";
import type { GalleryItem } from "../../shared/records.ts";
import { Button, Modal } from "../components/ui.tsx";
import { useEditorState } from "./context.tsx";
import { AltField } from "./fieldParts.tsx";
import { MediaLibrary, MediaThumb } from "./MediaLibrary.tsx";

export function MediaListEditor({
  items,
  max,
  onChange,
}: {
  items: GalleryItem[];
  max: number;
  onChange: (items: GalleryItem[]) => void;
}) {
  const { bundle } = useEditorState();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      {items.length === 0 ? <p className="text-sm text-neutral-500">No pictures yet.</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((it, i) => {
          const media = bundle.media.find((m) => m.rkey === it.media);
          const set = (patch: Partial<GalleryItem>) =>
            onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <li
              key={`${it.media}-${i}`}
              className="flex gap-3 rounded-md border border-neutral-200 p-2 dark:border-neutral-800"
            >
              {media ? (
                <MediaThumb media={media} className="h-20 w-20 flex-none rounded-md" />
              ) : (
                <div className="flex h-20 w-20 flex-none items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-500 dark:bg-neutral-800">
                  Deleted
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <AltField value={it.alt} noAlt={it.noAlt} onChange={(alt) => set({ alt })} />

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Button size="sm" disabled={items.length >= max} onClick={() => setOpen(true)}>
        <Plus size={14} /> Add a picture
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a picture" wide>
        <MediaLibrary
          only="image"
          onPick={(m) => {
            onChange([
              ...items,
              { media: m.rkey, alt: m.value.alt, ...(m.value.noAlt ? { noAlt: true } : {}) },
            ]);
            setOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}
