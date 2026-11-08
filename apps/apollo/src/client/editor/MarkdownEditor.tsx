/**
 * Markdown editor with a "Formatted" (WYSIWYG, tiptap) mode for people who
 * don't want to see markup, and a "Markdown" source mode (CodeMirror). Ported
 * from apps/sonasky-ref/.../CharacterEditor/DescriptionEditor.tsx.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { EditorView } from "@codemirror/view";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Command } from "@tiptap/pm/state";
import { isInTable, moveTableColumn, moveTableRow, selectedRect } from "@tiptap/pm/tables";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Image } from "@tiptap/extension-image";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  PanelLeft,
  PanelTop,
  Quote,
  Strikethrough,
  Table as TableIcon,
  Tags,
  Trash2,
  Underline as UnderlineIcon,
  Unlink,
} from "lucide-react";
import type { MediaEntry } from "../../shared/dto.ts";
import { linkValueError } from "../../shared/links.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { LabelsNode } from "./LabelsNode.ts";
import { imageMarkdown } from "./MediaLibrary.tsx";

/** Lets the editor insert and show uploaded images (`![alt](media:ID)`). */
export interface MarkdownImages {
  /** Open a picker; resolves with the chosen image, or null. */
  pick: () => Promise<MediaEntry | null>;
  /** Display URL for a media ID, if it's in the library. */
  urlFor: (id: string) => string | undefined;
}

/** Lets the editor insert the labels widget placeholder. */
export interface MarkdownLabels {
  /** Open the labels dialog; resolves with the placeholder snippet, or null. */
  pick: () => Promise<string | null>;
}

/**
 * Images in the formatted editor. The node keeps `src` as written
 * (`media:ID` round-trips through Markdown unchanged); only the on-screen
 * picture is resolved to the uploaded file.
 */
function imageExtension(urlFor: { current: MarkdownImages["urlFor"] | undefined }) {
  return Image.extend({
    addNodeView() {
      return ({ node }) => {
        const src = String(node.attrs.src ?? "");
        const alt = String(node.attrs.alt ?? "");
        const url = src.startsWith("media:")
          ? urlFor.current?.(src.slice("media:".length))
          : /^https:\/\//i.test(src)
            ? src
            : undefined;
        if (!url) {
          const missing = document.createElement("span");
          missing.className =
            "rounded bg-neutral-100 px-1 text-xs text-neutral-500 dark:bg-neutral-800";
          missing.textContent = `[image${alt ? `: ${alt}` : ""}]`;
          return { dom: missing };
        }
        const img = document.createElement("img");
        img.src = url;
        img.alt = alt;
        img.className = "inline-block max-h-64 rounded";
        return { dom: img };
      };
    },
  }).configure({ inline: true });
}

/** Largest table the size picker offers (more rows/columns can be added after). */
const PICKER_ROWS = 8;
const PICKER_COLS = 8;

/**
 * Size picker: hover (or arrow-key) over the grid to choose
 * rows x columns, click (or Enter) to insert. The first row is a header row by default.
 */
function TableSizePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState({ rows: 1, cols: 1 });
  const wrap = useRef<HTMLSpanElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  const focusCell = (rows: number, cols: number) => {
    setSize({ rows, cols });
    grid.current?.querySelector<HTMLButtonElement>(`[data-cell="${rows}x${cols}"]`)?.focus();
  };

  useEffect(() => {
    if (!open) return;
    focusCell(1, 1);
    const onPointerDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onGridKey = (e: KeyboardEvent) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const rows = Math.min(PICKER_ROWS, Math.max(1, size.rows + move[0]));
    const cols = Math.min(PICKER_COLS, Math.max(1, size.cols + move[1]));
    focusCell(rows, cols);
  };

  return (
    <span ref={wrap} className="relative inline-flex">
      <ToolbarButton title="Insert table" active={open} onClick={() => setOpen((o) => !o)}>
        <TableIcon size={16} />
      </ToolbarButton>
      {open ? (
        <div
          role="dialog"
          aria-label="Choose table size"
          className="absolute left-0 top-full z-20 mt-1 rounded-md border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          <div
            ref={grid}
            role="grid"
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${PICKER_COLS}, 1rem)` }}
            onKeyDown={onGridKey}
          >
            {Array.from({ length: PICKER_ROWS * PICKER_COLS }, (_, i) => {
              const r = Math.floor(i / PICKER_COLS) + 1;
              const c = (i % PICKER_COLS) + 1;
              const lit = r <= size.rows && c <= size.cols;
              return (
                <button
                  key={i}
                  type="button"
                  data-cell={`${r}x${c}`}
                  aria-label={`${r} by ${c} table`}
                  tabIndex={r === size.rows && c === size.cols ? 0 : -1}
                  onMouseEnter={() => setSize({ rows: r, cols: c })}
                  onClick={() => {
                    setOpen(false);
                    onPick(r, c);
                  }}
                  className={`h-4 w-4 rounded-sm border ${
                    lit
                      ? "border-sky-500 bg-sky-200 dark:bg-sky-800"
                      : "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-900"
                  }`}
                />
              );
            })}
          </div>
          <p
            className="mt-1.5 text-center text-xs text-neutral-600 dark:text-neutral-300"
            aria-live="polite"
          >
            {size.rows} {size.rows === 1 ? "row" : "rows"} × {size.cols}{" "}
            {size.cols === 1 ? "column" : "columns"}
          </p>
        </div>
      ) : null}
    </span>
  );
}

/**
 * Where the cursor is in the surrounding table, and whether that table has a
 * header row (first row all header cells) / header column (first cell of
 * every row a header cell). Header cells render bold. A table with a header
 * column or no header row can't be GFM, so tiptap-markdown saves it as HTML.
 */
function tableState(editor: Editor) {
  const { state } = editor;
  if (!isInTable(state)) return null;
  const rect = selectedRect(state);
  const isHeader = (cell: PMNode | null) => cell?.type.name === "tableHeader";
  const firstRow = rect.table.firstChild;
  let headerRow = Boolean(firstRow && firstRow.childCount > 0);
  firstRow?.forEach((cell) => {
    if (!isHeader(cell)) headerRow = false;
  });
  let headerColumn = rect.table.childCount > 0;
  rect.table.forEach((row) => {
    if (!isHeader(row.firstChild)) headerColumn = false;
  });
  return { ...rect, headerRow, headerColumn };
}

/** A labeled run of buttons that wraps as one unit (label never orphaned). */
function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0.5">
      <span
        aria-hidden
        className="mr-0.5 text-xs font-medium text-neutral-500 dark:text-neutral-400"
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/** Second toolbar row, shown while the cursor is in a table. */
function TableControls({ editor }: { editor: Editor }) {
  const t = tableState(editor);
  if (!t) return null;
  const run = (command: Command) => {
    command(editor.state, editor.view.dispatch);
    editor.commands.focus();
  };
  return (
    <div
      className="mt-0.5 flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-neutral-200 pt-1 dark:border-neutral-800"
      role="group"
      aria-label="Table"
    >
      <ToolGroup label="Row">
        <ToolbarButton
          title="Add row above"
          onClick={() => editor.chain().focus().addRowBefore().run()}
        >
          <BetweenHorizontalStart size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Add row below"
          onClick={() => editor.chain().focus().addRowAfter().run()}
        >
          <BetweenHorizontalEnd size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Move row up"
          disabled={t.top === 0}
          onClick={() => run(moveTableRow({ from: t.top, to: t.top - 1 }))}
        >
          <ArrowUp size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Move row down"
          disabled={t.bottom >= t.map.height}
          onClick={() => run(moveTableRow({ from: t.top, to: t.top + 1 }))}
        >
          <ArrowDown size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Delete row"
          disabled={!editor.can().deleteRow()}
          onClick={() => editor.chain().focus().deleteRow().run()}
        >
          <Trash2 size={16} />
        </ToolbarButton>
      </ToolGroup>

      <ToolGroup label="Column">
        <ToolbarButton
          title="Add column left"
          onClick={() => editor.chain().focus().addColumnBefore().run()}
        >
          <BetweenVerticalStart size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Add column right"
          onClick={() => editor.chain().focus().addColumnAfter().run()}
        >
          <BetweenVerticalEnd size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Move column left"
          disabled={t.left === 0}
          onClick={() => run(moveTableColumn({ from: t.left, to: t.left - 1 }))}
        >
          <ArrowLeft size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Move column right"
          disabled={t.right >= t.map.width}
          onClick={() => run(moveTableColumn({ from: t.left, to: t.left + 1 }))}
        >
          <ArrowRight size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Delete column"
          disabled={!editor.can().deleteColumn()}
          onClick={() => editor.chain().focus().deleteColumn().run()}
        >
          <Trash2 size={16} />
        </ToolbarButton>
      </ToolGroup>

      <ToolGroup label="Headers">
        <ToolbarButton
          title="Header row (bold first row)"
          active={t.headerRow}
          onClick={() => editor.chain().focus().toggleHeaderRow().run()}
        >
          <PanelTop size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Header column (bold first column)"
          active={t.headerColumn}
          onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
        >
          <PanelLeft size={16} />
        </ToolbarButton>
      </ToolGroup>

      <button
        type="button"
        onClick={() => editor.chain().focus().deleteTable().run()}
        className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
      >
        <Trash2 size={14} aria-hidden /> Delete table
      </button>
    </div>
  );
}

type EditorMode = "source" | "formatted";

function ToolbarButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded p-1.5 text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-800 ${
        active ? "bg-neutral-200 dark:bg-neutral-700" : ""
      }`}
    >
      {children}
    </button>
  );
}

function FormattedEditor({
  initialValue,
  onChange,
  minHeight,
  images,
  labels,
}: {
  initialValue: string;
  onChange: (value: string) => void;
  minHeight: string;
  images?: MarkdownImages;
  labels?: MarkdownLabels;
}) {
  const urlFor = useRef(images?.urlFor);
  urlFor.current = images?.urlFor;
  const editor = useEditor({
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      imageExtension(urlFor),
      LabelsNode,
      Markdown.configure({ html: true, linkify: false, breaks: true }),
    ],
    content: initialValue,
    onUpdate: ({ editor: e }) => {
      const markdownStorage = (e.storage as unknown as { markdown: MarkdownStorage }).markdown;
      onChange(markdownStorage.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: "apollo-prose max-w-none px-3 py-2 text-sm",
        style: `min-height:${minHeight}`,
      },
    },
  });

  if (!editor) return null;

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = globalThis.prompt(
      "Link to (a web address like https://example.com, or a page on your site like /about)",
      previousUrl ?? "https://",
    );
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const err = linkValueError(url);
    if (err) {
      globalThis.alert(err);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="rounded-md border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      <div
        className="sticky top-0 z-10 flex flex-wrap gap-0.5 rounded-t-md border-b border-neutral-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-900"
        role="toolbar"
      >
        <ToolbarButton
          title="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Big heading"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Medium heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Small heading"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Checklist"
          active={editor.isActive("taskList")}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        >
          <ListTodo size={16} />
        </ToolbarButton>
        <TableSizePicker
          onPick={(rows, cols) =>
            editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
          }
        />
        <ToolbarButton
          title="Divider line"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus size={16} />
        </ToolbarButton>
        {images ? (
          <ToolbarButton
            title="Insert image"
            onClick={() => {
              void images.pick().then((m) => {
                if (m) {
                  editor
                    .chain()
                    .focus()
                    .setImage({ src: `media:${m.rkey}`, alt: m.value.alt })
                    .run();
                }
              });
            }}
          >
            <ImagePlus size={16} />
          </ToolbarButton>
        ) : null}
        {labels ? (
          <ToolbarButton
            title="Insert your labels"
            onClick={() => {
              void labels.pick().then((snippet) => {
                if (snippet) editor.chain().focus().insertContent(snippet).run();
              });
            }}
          >
            <Tags size={16} />
          </ToolbarButton>
        ) : null}
        <ToolbarButton title="Add link" active={editor.isActive("link")} onClick={setLink}>
          <Link2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Remove link"
          disabled={!editor.isActive("link")}
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink size={16} />
        </ToolbarButton>
        <TableControls editor={editor} />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function MarkdownEditor({
  label,
  value,
  onChange,
  minHeight = "8rem",
  help,
  images,
  labels,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
  help?: ReactNode;
  /** Enables "Insert image" (pages and posts; needs the media library). */
  images?: MarkdownImages;
  /** Enables "Insert labels" (pages and posts in writing mode). */
  labels?: MarkdownLabels;
}) {
  const sourceView = useRef<EditorView | null>(null);
  const insertImageInSource = async () => {
    const m = await images?.pick();
    const view = sourceView.current;
    if (!m || !view) return;
    view.dispatch(view.state.replaceSelection(imageMarkdown(m)));
    view.focus();
  };
  const insertLabelsInSource = async () => {
    const snippet = await labels?.pick();
    const view = sourceView.current;
    if (!snippet || !view) return;
    // Raw HTML needs blank lines around it to stay a block in Markdown.
    view.dispatch(view.state.replaceSelection(`\n\n${snippet}\n\n`));
    view.focus();
  };
  const [mode, setMode] = useState<EditorMode>("formatted");
  // Remount the WYSIWYG editor when switching back so it picks up source edits.
  const [formattedKey, setFormattedKey] = useState(0);
  const modeButton = useMemo(
    () => (m: EditorMode, text: string) => (
      <button
        type="button"
        aria-pressed={mode === m}
        onClick={() => {
          if (m === "formatted" && mode !== "formatted") setFormattedKey((k) => k + 1);
          setMode(m);
        }}
        className={`px-2 py-1 ${
          mode === m
            ? "bg-neutral-200 dark:bg-neutral-700"
            : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
        }`}
      >
        {text}
      </button>
    ),
    [mode],
  );

  return (
    <div className="space-y-1">
      {/* In Markdown mode this row holds the editor's buttons, so keep it in view on long posts. */}
      <div
        className={`flex items-center justify-between ${
          mode === "source" ? "sticky top-0 z-10 bg-white py-1 dark:bg-neutral-900" : ""
        }`}
      >
        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</span>
        <div className="flex items-center gap-2">
          {images && mode === "source" ? (
            <button
              type="button"
              onClick={() => void insertImageInSource()}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <ImagePlus size={14} aria-hidden /> Insert image
            </button>
          ) : null}
          {labels && mode === "source" ? (
            <button
              type="button"
              onClick={() => void insertLabelsInSource()}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <Tags size={14} aria-hidden /> Insert labels
            </button>
          ) : null}
          <div className="flex overflow-hidden rounded-md border border-neutral-300 text-xs dark:border-neutral-700">
            {modeButton("formatted", "Formatted")}
            {modeButton("source", "Markdown")}
          </div>
        </div>
      </div>
      {mode === "source" ? (
        <CodeEditor
          value={value}
          onChange={onChange}
          language="markdown"
          minHeight={minHeight}
          label={label}
          onView={(view) => {
            sourceView.current = view;
          }}
        />
      ) : (
        <FormattedEditor
          key={formattedKey}
          initialValue={value}
          onChange={onChange}
          minHeight={minHeight}
          images={images}
          labels={labels}
        />
      )}
      {help ? <p className="text-xs text-neutral-500 dark:text-neutral-400">{help}</p> : null}
    </div>
  );
}
