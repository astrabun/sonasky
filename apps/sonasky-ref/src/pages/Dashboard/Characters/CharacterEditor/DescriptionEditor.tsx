import { useEffect, useId, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
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
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Bold,
  Columns3,
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
  Rows3,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline as UnderlineIcon,
  Unlink,
} from "lucide-react";
import { IconButton } from "../../../../components/ui/IconButton";
import { Tooltip } from "../../../../components/ui/Tooltip";
import { MARKDOWN_TABLE_PROSE_CLASS } from "../../../../helpers/markdownProseClass";

type EditorMode = "source" | "formatted";

interface DescriptionEditorProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  helperText?: string;
}

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );

  useEffect(() => {
    const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) {
      return;
    }
    const listener = (e: MediaQueryListEvent) => setIsDark(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  return isDark;
}

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
  children: React.ReactNode;
}) {
  return (
    <Tooltip title={title}>
      <IconButton
        size="small"
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={active ? "bg-gray-200 dark:bg-gray-700" : ""}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

function FormattedEditor({
  initialValue,
  onChange,
}: {
  initialValue: string;
  onChange: (value: string) => void;
}) {
  const editor = useEditor({
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: false,
      }),
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
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[8rem] px-3 py-2 outline-none " +
          `[&_input[type=checkbox]]:mr-1 ${MARKDOWN_TABLE_PROSE_CLASS}`,
      },
    },
  });

  if (!editor) {
    return null;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = globalThis.prompt("Link URL", previousUrl ?? "https://");
    if (url === null) {
      return;
    }
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div className="rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-900">
      <div className="flex flex-wrap gap-0.5 border-b border-gray-200 p-1 dark:border-gray-700">
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
          title="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
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
        <ToolbarButton title="Table" onClick={insertTable}>
          <TableIcon size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Divider"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus size={16} />
        </ToolbarButton>
        <ToolbarButton title="Link" active={editor.isActive("link")} onClick={setLink}>
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
      {editor.isActive("table") && (
        <div className="flex flex-wrap gap-0.5 border-b border-gray-200 p-1 dark:border-gray-700">
          <ToolbarButton
            title="Add column before"
            onClick={() => editor.chain().focus().addColumnBefore().run()}
          >
            <ArrowLeftToLine size={16} />
          </ToolbarButton>
          <ToolbarButton
            title="Add column after"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            <ArrowRightToLine size={16} />
          </ToolbarButton>
          <ToolbarButton
            title="Delete column"
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            <Columns3 size={16} />
          </ToolbarButton>
          <ToolbarButton
            title="Add row before"
            onClick={() => editor.chain().focus().addRowBefore().run()}
          >
            <ArrowUpToLine size={16} />
          </ToolbarButton>
          <ToolbarButton
            title="Add row after"
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            <ArrowDownToLine size={16} />
          </ToolbarButton>
          <ToolbarButton
            title="Delete row"
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            <Rows3 size={16} />
          </ToolbarButton>
          <ToolbarButton
            title="Delete table"
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            <Trash2 size={16} />
          </ToolbarButton>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

export function DescriptionEditor({
  label,
  value,
  onChange,
  maxLength,
  helperText,
}: DescriptionEditorProps) {
  const id = useId();
  const [mode, setMode] = useState<EditorMode>("formatted");
  const isDark = useIsDarkMode();
  const extensions = useMemo(() => [markdown(), EditorView.lineWrapping], []);

  return (
    <div className="mb-4">
      {label && (
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor={id} className="block text-sm font-medium">
            {label}
          </label>
          <div className="flex overflow-hidden rounded-md border border-gray-300 text-xs dark:border-gray-600">
            <button
              type="button"
              onClick={() => setMode("source")}
              className={`px-2 py-1 ${
                mode === "source"
                  ? "bg-gray-200 dark:bg-gray-700"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              Source
            </button>
            <button
              type="button"
              onClick={() => setMode("formatted")}
              className={`px-2 py-1 ${
                mode === "formatted"
                  ? "bg-gray-200 dark:bg-gray-700"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              Formatted
            </button>
          </div>
        </div>
      )}
      {mode === "source" ? (
        <CodeMirror
          id={id}
          value={value}
          onChange={onChange}
          extensions={extensions}
          theme={isDark ? "dark" : "light"}
          minHeight="8rem"
          className="overflow-hidden rounded-md border border-gray-300 dark:border-gray-600"
        />
      ) : (
        <FormattedEditor key={id} initialValue={value} onChange={onChange} />
      )}
      <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        {helperText && <p>{helperText}</p>}
        {typeof maxLength === "number" && (
          <p className={value.length > maxLength ? "text-red-500" : undefined}>
            {value.length}/{maxLength}
          </p>
        )}
      </div>
    </div>
  );
}
