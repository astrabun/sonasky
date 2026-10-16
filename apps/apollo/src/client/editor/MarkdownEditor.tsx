/**
 * Markdown editor with a "Formatted" (WYSIWYG, tiptap) mode for people who
 * don't want to see markup, and a "Markdown" source mode (CodeMirror). Ported
 * from apps/sonasky-ref/.../CharacterEditor/DescriptionEditor.tsx.
 */

import { useMemo, useState, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline as UnderlineIcon,
  Unlink,
} from "lucide-react";
import { linkValueError } from "../../shared/links.ts";
import { CodeEditor } from "./CodeEditor.tsx";

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
}: {
  initialValue: string;
  onChange: (value: string) => void;
  minHeight: string;
}) {
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
        className="flex flex-wrap gap-0.5 border-b border-neutral-200 p-1 dark:border-neutral-800"
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
        <ToolbarButton
          title="Table"
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <TableIcon size={16} />
        </ToolbarButton>
        {editor.isActive("table") ? (
          <ToolbarButton
            title="Delete table"
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            <Trash2 size={16} />
          </ToolbarButton>
        ) : null}
        <ToolbarButton
          title="Divider line"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus size={16} />
        </ToolbarButton>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minHeight?: string;
  help?: ReactNode;
}) {
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
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</span>
        <div className="flex overflow-hidden rounded-md border border-neutral-300 text-xs dark:border-neutral-700">
          {modeButton("formatted", "Formatted")}
          {modeButton("source", "Markdown")}
        </div>
      </div>
      {mode === "source" ? (
        <CodeEditor
          value={value}
          onChange={onChange}
          language="markdown"
          minHeight={minHeight}
          label={label}
        />
      ) : (
        <FormattedEditor
          key={formattedKey}
          initialValue={value}
          onChange={onChange}
          minHeight={minHeight}
        />
      )}
      {help ? <p className="text-xs text-neutral-500 dark:text-neutral-400">{help}</p> : null}
    </div>
  );
}
