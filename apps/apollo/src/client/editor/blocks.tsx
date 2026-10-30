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
  MessagesSquare,
  Minus,
  MoveVertical,
  Plus,
  Puzzle,
  RectangleHorizontal,
  Tags,
  TextAlignStart,
  Trash2,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { COMMUNITY_BLOCKS, findCommunityBlock } from "@sonasky/apollo-blocks";
import { upgradeBlock } from "../../shared/communityUpgrades.ts";
import { LIMITS, utf8Bytes } from "../../shared/limits.ts";
import type {
  Block,
  BlockType,
  BskyCommentsBlock,
  ButtonsBlock,
  CommentsSort,
  EventBlock,
  GalleryBlock,
  ImageBlock,
} from "../../shared/records.ts";
import { bskyUrlForUri, postUriFrom, profileDidFrom, starterPackUriFrom } from "../bsky.ts";
import { Button, Card, Modal, Notice, Select, TextInput } from "../components/ui.tsx";
import { CommunityBlockFields } from "./CommunityBlockFields.tsx";
import { BadgesEditor } from "./badges/BadgesEditor.tsx";
import { AltField, LinkHint } from "./fieldParts.tsx";
import { fromLocalInput, toLocalInput } from "./localDate.ts";
import { DEFAULT_LABELS_SETTINGS, LabelsFields } from "./LabelsFields.tsx";
import { MarkdownEditor } from "./MarkdownEditor.tsx";
import { MediaListEditor } from "./MediaListEditor.tsx";
import { MediaField } from "./MediaLibrary.tsx";

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
    type: `${D}#badges`,
    name: "88x31 Badges",
    description: "Little 88x31 web buttons - yours and your friends' - in a row.",
    icon: RectangleHorizontal,
    create: () => ({ $type: `${D}#badges`, items: [] }),
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
    type: `${D}#bskyComments`,
    name: "Bluesky comments",
    description: "Replies to your Bluesky post about this page, shown as comments.",
    icon: MessagesSquare,
    create: () => ({ $type: `${D}#bskyComments`, sort: "oldest" }),
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

/** Name and icon for a block's header; community blocks are looked up by id. */
function blockInfo(block: Block): { name: string; icon: LucideIcon; community: boolean } | null {
  if (block.$type === `${D}#community`) {
    const def = findCommunityBlock(block.block);
    return { name: def?.name ?? "Community block", icon: Puzzle, community: true };
  }
  const info = catalogFor(block.$type);
  return info ? { name: info.name, icon: info.icon, community: false } : null;
}

function CommunityBadge() {
  return (
    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-violet-800 uppercase dark:bg-violet-950 dark:text-violet-200">
      Community
    </span>
  );
}

const MENU_ITEM_CLASS =
  "flex w-full items-start gap-3 rounded-lg border border-neutral-200 p-3 text-left hover:border-sky-400 hover:bg-sky-50 dark:border-neutral-800 dark:hover:bg-sky-950";

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
  return (
    <MediaListEditor
      items={block.items}
      max={LIMITS.galleryItems}
      onChange={(items) => onChange({ ...block, items })}
    />
  );
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

/**
 * Paste-a-Bluesky-link field that resolves to the stored identifier. With
 * `optional`, emptying it reports "" (unset).
 */
export function BskyLinkField({
  label,
  help,
  current,
  resolve,
  onResolved,
  optional = false,
}: {
  label: string;
  help: string;
  current: string;
  resolve: (input: string) => Promise<string>;
  onResolved: (value: string) => void;
  optional?: boolean;
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
        onBlur={() => {
          if (input.trim()) void run();
          else if (optional && current) {
            setError(null);
            onResolved("");
          }
        }}
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

/** Which Bluesky post's replies to show. Shared with the page settings' Comments option. */
export function CommentsPostField({
  post,
  onChange,
}: {
  post: string | undefined;
  onChange: (post: string | undefined) => void;
}) {
  return (
    <BskyLinkField
      label="Bluesky post (optional)"
      help="Leave empty to use your own Bluesky post that links to this page (the first one, if you shared it more than once). Comments only show once you've shared it. Paste a post's link to use that one instead."
      current={post ?? ""}
      resolve={postUriFrom}
      onResolved={(uri) => onChange(uri || undefined)}
      optional
    />
  );
}

/** Comment order. Shared with the page settings' Comments option. */
export function CommentsSortField({
  sort,
  onChange,
}: {
  sort: CommentsSort | undefined;
  onChange: (sort: CommentsSort) => void;
}) {
  return (
    <Select
      label="Order"
      value={sort ?? "oldest"}
      onChange={(e) => onChange(e.target.value as CommentsSort)}
      options={[
        { value: "oldest", label: "Oldest first" },
        { value: "newest", label: "Newest first" },
        { value: "likes", label: "Most liked first" },
      ]}
    />
  );
}

function BskyCommentsFields({
  block,
  onChange,
}: {
  block: BskyCommentsBlock;
  onChange: (b: BskyCommentsBlock) => void;
}) {
  return (
    <div className="space-y-3">
      <CommentsPostField post={block.post} onChange={(post) => onChange({ ...block, post })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput
          label="Heading (optional)"
          placeholder="Comments"
          value={block.title ?? ""}
          onChange={(e) => onChange({ ...block, title: e.target.value || undefined })}
        />
        <CommentsSortField sort={block.sort} onChange={(sort) => onChange({ ...block, sort })} />
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Replies the post's author hid on Bluesky, and replies labeled as adult or graphic, aren't
        shown.
      </p>
    </div>
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
    case `${D}#badges`:
      return <BadgesEditor block={block} onChange={onChange} />;
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
    case `${D}#bskyComments`:
      return <BskyCommentsFields block={block} onChange={onChange} />;
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
    case `${D}#community`:
      return <CommunityBlockFields block={block} onChange={onChange} />;
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
                className={MENU_ITEM_CLASS}
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
        {COMMUNITY_BLOCKS.length ? (
          <section className="mt-6 space-y-2">
            <h3 className="text-sm font-semibold">Community blocks</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Made by people in the community and looked after on a best-effort basis.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {COMMUNITY_BLOCKS.map((def) => (
                <li key={def.id}>
                  <button
                    type="button"
                    className={MENU_ITEM_CLASS}
                    onClick={() => {
                      onAdd({
                        $type: `${D}#community`,
                        block: def.id,
                        fields: structuredClone(def.example) as Record<string, unknown>,
                      });
                      setOpen(false);
                    }}
                  >
                    <Puzzle size={22} className="mt-0.5 flex-none text-violet-600" aria-hidden />
                    <span>
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        {def.name} <CommunityBadge />
                      </span>
                      <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                        {def.description}
                      </span>
                      <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                        by {def.author.name}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
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
  blocks: input,
  onChange,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}) {
  // Graduated community blocks are edited (and saved) as their official block.
  const blocks = input.map(upgradeBlock);
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
        const info = blockInfo(block);
        return (
          <Card key={ids[i]}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                {info ? <info.icon size={16} aria-hidden /> : null}
                {info?.name ?? "Block"}
                {info?.community ? <CommunityBadge /> : null}
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
