import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";

export type CodeLanguage = "markdown" | "html" | "css" | "javascript";

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
  useEffect(() => {
    const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const listener = (e: MediaQueryListEvent) => setIsDark(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);
  return isDark;
}

export function CodeEditor({
  value,
  onChange,
  language,
  minHeight = "12rem",
  label,
  onView,
}: {
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  minHeight?: string;
  /** Accessible name for the editor. */
  label: string;
  /** Receives the CodeMirror view, e.g. to insert text at the cursor. */
  onView?: (view: EditorView) => void;
}) {
  const isDark = useIsDarkMode();
  const extensions = useMemo(() => {
    const lang =
      language === "markdown"
        ? markdown()
        : language === "html"
          ? html()
          : language === "css"
            ? css()
            : javascript();
    return [
      lang,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": label }),
    ];
  }, [language, label]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={isDark ? "dark" : "light"}
      minHeight={minHeight}
      onCreateEditor={onView}
      className="overflow-hidden rounded-md border border-neutral-300 text-sm dark:border-neutral-700"
    />
  );
}
