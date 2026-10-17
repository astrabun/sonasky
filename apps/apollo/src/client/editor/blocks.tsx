/**
 * The block builder - the default, no-code way to make a page. Each block has a
 * plain-language name and a small form; nothing here asks for markup.
 */

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  Heading,
  Image,
  LayoutGrid,
  Link,
  MessageSquare,
  Minus,
  MoveVertical,
  Plus,
  Tags,
  TextAlignStart,
  Trash2,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { LIMITS, utf8Bytes } from "../../shared/limits.ts";
import { classifyLink, linkValueError } from "../../shared/links.ts";
import type {
  Block,
  BlockType,
  ButtonsBlock,
  EventBlock,
  GalleryBlock,
  GalleryItem,
  ImageBlock,
} from "../../shared/records.ts";
import { bskyUrlForUri, postUriFrom, profileDidFrom, starterPackUriFrom } from "../bsky.ts";
import { Button, Card, Modal, Notice, Select, TextArea, TextInput } from "../components/ui.tsx";
import { DEFAULT_LABELS_SETTINGS, LabelsFields } from "./LabelsFields.tsx";
import { MarkdownEditor } from "./MarkdownEditor.tsx";
import { MediaField, MediaLibrary, MediaThumb } from "./MediaLibrary.tsx";
import { useEditorState } from "./context.tsx";

const D = "app.sonasky.apollo.defs";

interface CatalogItem {
  type: BlockType;
  name: string;
  description: string;
  icon: LucideIcon;
  create: () => Block;
}

export const BLOCK_CATALOG: CatalogItem[] = [
  {
    type: `${D}#heading`,
    name: "Heading",
    description: "A title for a section.",
    icon: Heading,
    create: () => ({ $type: `${D}#heading`, text: "", level: 2 }),
  },
  {
    type: `${D}#text`,
    name: "Text",
    description: "Paragraphs, lists, links and formatting.",
    icon: TextAlignStart,
    create: () => ({ $type: `${D}#text`, markdown: "" }),
  },
  {
    type: `${D}#image`,
    name: "Image",
    description: "One picture, with an optional caption.",
    icon: Image,
    create: () => ({ $type: `${D}#image`, media: "", alt: "", size: "full" }),
  },
  {
    type: `${D}#buttons`,
    name: "Link buttons",
    description: "Big buttons that link anywhere - great for link pages.",
    icon: Link,
    create: () => ({ $type: `${D}#buttons`, items: [{ label: "", url: "https://" }] }),
  },
  {
    type: `${D}#gallery`,
    name: "Gallery",
    description: "A grid of pictures.",
    icon: LayoutGrid,
    create: () => ({ $type: `${D}#gallery`, items: [] }),
  },
  {
    type: `${D}#event`,
    name: "Event",
    description: "A date, time and place.",
    icon: CalendarDays,
    create: () => ({
      $type: `${D}#event`,
      name: "",
      start: "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  },
  {
    type: `${D}#bskyProfile`,
    name: "Bluesky profile",
    description: "A card for someone's Bluesky profile.",
    icon: UserRound,
    create: () => ({ $type: `${D}#bskyProfile`, did: "" }),
  },
  {
    type: `${D}#bskyPost`,
    name: "Bluesky post",
    description: "Show a Bluesky post.",
    icon: MessageSquare,
    create: () => ({ $type: `${D}#bskyPost`, uri: "" }),
  },
  {
    type: `${D}#starterPack`,
    name: "Starter pack",
    description: "A card for a Bluesky starter pack.",
    icon: Users,
    create: () => ({ $type: `${D}#starterPack`, uri: "" }),
  },
  {
    type: `${D}#labels`,
    name: "Your labels",
    description: "Labels on your Bluesky account, from SonaSky or other labelers.",
    icon: Tags,
    create: () => ({
      $type: `${D}#labels`,
      ...DEFAULT_LABELS_SETTINGS,
      labelers: [...DEFAULT_LABELS_SETTINGS.labelers],
    }),
  },
  {
    type: `${D}#divider`,
    name: "Divider",
    description: "A line to separate sections.",
    icon: Minus,
    create: () => ({ $type: `${D}#divider` }),
  },
  {
    type: `${D}#spacer`,
    name: "Space",
    description: "Some empty space.",
    icon: MoveVertical,
    create: () => ({ $type: `${D}#spacer`, size: "medium" }),
  },
];

function catalogFor(type: BlockType): CatalogItem | undefined {
  return BLOCK_CATALOG.find((c) => c.type === type);
}

/** Small "visitors will see a warning" hint under link fields. */
function LinkHint({ value }: { value: string }) {
  const err = value.trim() && value.trim() !== "https://" ? linkValueError(value) : null;
  if (err) return <p className="text-xs text-rose-600">{err}</p>;
  if (
    /^https?:/i.test(value.trim()) &&
    classifyLink(value, globalThis.location.origin).kind === "external"
  ) {
    return (
      <p className="text-xs text-neutral-500">
        This goes outside Apollo and Bluesky, so visitors will see a “you're leaving” notice first.
      </p>
    );
  }
  return null;
}

function ButtonsEditor({
  block,
  onChange,
}: {
  block: ButtonsBlock;
  onChange: (b: ButtonsBlock) => void;
}) {
  const items = block.items;
  const set = (i: number, patch: Partial<ButtonsBlock["items"][number]>) =>
    onChange({ ...block, items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange({ ...block, items: next });
  };
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div
          key={i}
          className="space-y-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <TextInput
              label="Button text"
              value={it.label}
              onChange={(e) => set(i, { label: e.target.value })}
              placeholder="My shop"
            />
            <div className="space-y-1">
              <TextInput
                label="Links to"
                value={it.url}
                onChange={(e) => set(i, { url: e.target.value })}
                placeholder="https://... or /about"
              />
              <LinkHint value={it.url} />
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label="Move button up"
            >
              <ArrowUp size={14} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
              aria-label="Move button down"
            >
              <ArrowDown size={14} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange({ ...block, items: items.filter((_, j) => j !== i) })}
            >
              Remove
            </Button>
          </div>
        </div>
      ))}
      <Button
        size="sm"
        disabled={items.length >= LIMITS.buttonsPerBlock}
        onClick={() => onChange({ ...block, items: [...items, { label: "", url: "https://" }] })}
      >
        <Plus size={14} /> Add a button
      </Button>
    </div>
  );
}

function GalleryEditor({
  block,
  onChange,
}: {
  block: GalleryBlock;
  onChange: (b: GalleryBlock) => void;
}) {
  const { bundle } = useEditorState();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      {block.items.length === 0 ? (
        <p className="text-sm text-neutral-500">No pictures yet.</p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {block.items.map((it, i) => {
          const media = bundle.media.find((m) => m.rkey === it.media);
          const set = (patch: Partial<GalleryItem>) =>
            onChange({
              ...block,
              items: block.items.map((x, j) => (j === i ? { ...x, ...patch } : x)),
            });
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
                  onClick={() =>
                    onChange({ ...block, items: block.items.filter((_, j) => j !== i) })
                  }
                >
                  Remove
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Button
        size="sm"
        disabled={block.items.length >= LIMITS.galleryItems}
        onClick={() => setOpen(true)}
      >
        <Plus size={14} /> Add a picture
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a picture" wide>
        <MediaLibrary
          only="image"
          onPick={(m) => {
            onChange({
              ...block,
              items: [
                ...block.items,
                { media: m.rkey, alt: m.value.alt, ...(m.value.noAlt ? { noAlt: true } : {}) },
              ],
            });
            setOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

const TIMEZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
      "timeZone",
    );
  } catch {
    return ["UTC"];
  }
})();

function EventEditor({
  block,
  onChange,
}: {
  block: EventBlock;
  onChange: (b: EventBlock) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <TextInput
          label="Event name"
          value={block.name}
          onChange={(e) => onChange({ ...block, name: e.target.value })}
        />
      </div>
      <TextInput
        label="Starts"
        type="datetime-local"
        value={toLocalInput(block.start)}
        onChange={(e) => onChange({ ...block, start: fromLocalInput(e.target.value) })}
        help="Use your own local time."
      />
      <TextInput
        label="Ends (optional)"
        type="datetime-local"
        value={toLocalInput(block.end)}
        onChange={(e) => onChange({ ...block, end: fromLocalInput(e.target.value) || undefined })}
      />
      <Select
        label="Show times in"
        value={block.timezone ?? "UTC"}
        onChange={(e) => onChange({ ...block, timezone: e.target.value })}
        options={TIMEZONES.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))}
      />
      <TextInput
        label="Where (optional)"
        value={block.location ?? ""}
        onChange={(e) => onChange({ ...block, location: e.target.value || undefined })}
        placeholder="Online, or an address"
      />
      <div className="space-y-1 sm:col-span-2">
        <TextInput
          label="More info link (optional)"
          value={block.url ?? ""}
          onChange={(e) => onChange({ ...block, url: e.target.value || undefined })}
          placeholder="https://..."
        />
        {block.url ? <LinkHint value={block.url} /> : null}
      </div>
    </div>
  );
}

/** Paste-a-Bluesky-link field that resolves to the stored identifier. */
function BskyLinkField({
  label,
  help,
  current,
  resolve,
  onResolved,
}: {
  label: string;
  help: string;
  current: string;
  resolve: (input: string) => Promise<string>;
  onResolved: (value: string) => void;
}) {
  const [input, setInput] = useState(current ? bskyUrlForUri(current) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      onResolved(await resolve(input));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That link didn't work.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <TextInput
        label={label}
        help={help}
        error={error}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onBlur={() => input.trim() && void run()}
        placeholder="https://bsky.app/..."
      />
      {busy ? <p className="text-xs text-neutral-500">Checking...</p> : null}
      {current && !busy && !error ? (
        <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
          <Check size={14} aria-hidden /> Linked
        </p>
      ) : null}
    </div>
  );
}

/**
 * Alt text for a picture placed on a page. Prefilled from the upload; if the
 * uploader chose not to describe it, that choice carries over (and typing a
 * description here still wins).
 */
function AltField({
  value,
  noAlt,
  onChange,
}: {
  value: string;
  noAlt?: boolean;
  onChange: (alt: string) => void;
}) {
  return (
    <TextArea
      label="Description (alt text)"
      rows={2}
      value={value}
      placeholder={noAlt ? "No description" : undefined}
      help={
        noAlt && !value.trim()
          ? "You chose not to describe this picture when you uploaded it. People using screen readers won't know what it shows."
          : "Describe the picture for people using screen readers."
      }
      error={!noAlt && !value.trim() ? "Add a description." : null}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function ImageEditor({
  block,
  onChange,
}: {
  block: ImageBlock;
  onChange: (b: ImageBlock) => void;
}) {
  return (
    <div className="space-y-3">
      <MediaField
        label="Picture"
        value={block.media || undefined}
        onChange={(rkey, media) =>
          onChange({
            ...block,
            media: rkey ?? "",
            alt: media?.value.alt ?? "",
            noAlt: media?.value.noAlt ? true : undefined,
          })
        }
      />
      <AltField
        value={block.alt}
        noAlt={block.noAlt}
        onChange={(alt) => onChange({ ...block, alt })}
      />
      <TextInput
        label="Caption (optional)"
        value={block.caption ?? ""}
        onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })}
      />
      <Select
        label="Size"
        value={block.size ?? "full"}
        onChange={(e) => onChange({ ...block, size: e.target.value as ImageBlock["size"] })}
        options={[
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
          { value: "full", label: "Full width" },
        ]}
      />
    </div>
  );
}

function BlockFields({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  switch (block.$type) {
    case `${D}#heading`:
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <TextInput
            label="Heading text"
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
          <Select
            label="Size"
            value={String(block.level)}
            onChange={(e) => onChange({ ...block, level: Number(e.target.value) as 1 | 2 | 3 })}
            options={[
              { value: "1", label: "Big" },
              { value: "2", label: "Medium" },
              { value: "3", label: "Small" },
            ]}
          />
        </div>
      );
    case `${D}#text`: {
      const bytes = utf8Bytes(block.markdown);
      return (
        <MarkdownEditor
          label="Text"
          value={block.markdown}
          onChange={(markdown) => onChange({ ...block, markdown })}
          help={
            bytes > LIMITS.textBlockBytes * 0.8
              ? `This text block is ${Math.round((bytes / LIMITS.textBlockBytes) * 100)}% full. Add another Text block to keep going.`
              : undefined
          }
        />
      );
    }
    case `${D}#image`:
      return <ImageEditor block={block} onChange={onChange} />;
    case `${D}#buttons`:
      return <ButtonsEditor block={block} onChange={onChange} />;
    case `${D}#gallery`:
      return <GalleryEditor block={block} onChange={onChange} />;
    case `${D}#event`:
      return <EventEditor block={block} onChange={onChange} />;
    case `${D}#bskyProfile`:
      return (
        <BskyLinkField
          label="Bluesky profile"
          help="Paste a profile link or a handle, like alice.bsky.social."
          current={block.did}
          resolve={profileDidFrom}
          onResolved={(did) => onChange({ ...block, did })}
        />
      );
    case `${D}#bskyPost`:
      return (
        <BskyLinkField
          label="Bluesky post"
          help="Open the post on Bluesky, choose Share &rarr; Copy link, and paste it here."
          current={block.uri}
          resolve={postUriFrom}
          onResolved={(uri) => onChange({ ...block, uri })}
        />
      );
    case `${D}#starterPack`:
      return (
        <BskyLinkField
          label="Starter pack"
          help="Open the starter pack on bsky.app and paste its link (the long one, not go.bsky.app)."
          current={block.uri}
          resolve={starterPackUriFrom}
          onResolved={(uri) => onChange({ ...block, uri })}
        />
      );
    case `${D}#labels`:
      return <LabelsFields value={block} onChange={(v) => onChange({ ...block, ...v })} />;
    case `${D}#spacer`:
      return (
        <Select
          label="How much space"
          value={block.size}
          onChange={(e) =>
            onChange({ ...block, size: e.target.value as "small" | "medium" | "large" })
          }
          options={[
            { value: "small", label: "A little" },
            { value: "medium", label: "Some" },
            { value: "large", label: "A lot" },
          ]}
        />
      );
    case `${D}#divider`:
      return <p className="text-sm text-neutral-500">A line across the page. Nothing to set up.</p>;
    default:
      return <Notice tone="warn">This block type isn't supported by this editor yet.</Notice>;
  }
}

function AddBlockMenu({ onAdd, disabled }: { onAdd: (b: Block) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="w-full border-dashed"
      >
        <Plus size={16} /> Add a block
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a block" wide>
        <ul className="grid gap-2 sm:grid-cols-2">
          {BLOCK_CATALOG.map((item) => (
            <li key={item.type}>
              <button
                type="button"
                className="flex w-full items-start gap-3 rounded-lg border border-neutral-200 p-3 text-left hover:border-sky-400 hover:bg-sky-50 dark:border-neutral-800 dark:hover:bg-sky-950"
                onClick={() => {
                  onAdd(item.create());
                  setOpen(false);
                }}
              >
                <item.icon size={22} className="mt-0.5 flex-none text-sky-600" aria-hidden />
                <span>
                  <span className="block text-sm font-semibold">{item.name}</span>
                  <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                    {item.description}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

let nextBlockId = 0;
const newBlockId = () => `b${nextBlockId++}`;

/**
 * Remount this (with a new `key`) when `blocks` is replaced from outside, e.g.
 * restoring a draft - block ids are tracked locally so editors with internal
 * state (the WYSIWYG text editor) stay attached to the right block on reorder.
 */
export function BlockList({
  blocks,
  onChange,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}) {
  const idsRef = useRef<string[]>([]);
  while (idsRef.current.length < blocks.length) idsRef.current.push(newBlockId());
  idsRef.current.length = blocks.length;
  const ids = idsRef.current;

  const set = (i: number, b: Block) => onChange(blocks.map((x, j) => (j === i ? b : x)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...blocks];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    onChange(next);
  };
  const removeAt = (i: number) => {
    ids.splice(i, 1);
    onChange(blocks.filter((_, j) => j !== i));
  };
  return (
    <div className="space-y-3">
      {blocks.length === 0 ? (
        <Notice>
          This page is empty. Add a block to get started - try a Heading and some Text.
        </Notice>
      ) : null}
      {blocks.map((block, i) => {
        const info = catalogFor(block.$type);
        return (
          <Card key={ids[i]}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                {info ? <info.icon size={16} aria-hidden /> : null}
                {info?.name ?? "Block"}
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`Move ${info?.name ?? "block"} up`}
                >
                  <ArrowUp size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={i === blocks.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Move ${info?.name ?? "block"} down`}
                >
                  <ArrowDown size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeAt(i)}
                  aria-label={`Remove ${info?.name ?? "block"}`}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
            <BlockFields block={block} onChange={(b) => set(i, b)} />
          </Card>
        );
      })}
      <AddBlockMenu
        disabled={blocks.length >= LIMITS.blocksPerPage}
        onAdd={(b) => onChange([...blocks, b])}
      />
    </div>
  );
}
