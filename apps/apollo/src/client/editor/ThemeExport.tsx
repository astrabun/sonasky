/**
 * "Export theme": the current theme either as a ready-to-submit community
 * theme file (@sonasky/apollo-themes format, checked with the same validator
 * CI runs), or as the full CSS Apollo generates, for people who want to keep
 * going in code.
 */

import { useState } from "react";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import {
  themeDefinitionSource,
  themeIdFromName,
  validateTheme,
  type ThemeDefinition,
} from "@sonasky/apollo-themes";
import type { ThemeTokens } from "../../shared/records.ts";
import { googleFontFamilies, themeCss } from "../../shared/themeCss.ts";
import { findTheme } from "../../shared/themes.ts";
import { Button, Modal, Notice, TextInput } from "../components/ui.tsx";

const CONTRIBUTING_URL =
  "https://github.com/astrabun/sonasky/tree/main/packages/apollo-themes#contributing-a-community-theme";

function CopyDownload({ text, filename, type }: { text: string; filename: string; type: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button
        size="sm"
        onClick={() => {
          const url = URL.createObjectURL(new Blob([text], { type }));
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        <Download size={14} aria-hidden /> Download {filename}
      </Button>
    </div>
  );
}

function CodeBlock({ text, label }: { text: string; label: string }) {
  return (
    <textarea
      readOnly
      aria-label={label}
      value={text}
      rows={14}
      className="w-full rounded-md border border-neutral-300 bg-neutral-50 p-3 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
      onFocus={(e) => e.currentTarget.select()}
    />
  );
}

function CommunityExport({
  tokens,
  basedOn,
  handle,
}: {
  tokens: ThemeTokens;
  basedOn?: string;
  handle?: string;
}) {
  const base = findTheme(basedOn);
  const [name, setName] = useState(base ? `${base.name} remix` : "My theme");
  const [description, setDescription] = useState("");
  const [authorName, setAuthorName] = useState(handle ?? "");
  const [authorHandle, setAuthorHandle] = useState(handle ?? "");

  const id = themeIdFromName(name);
  const theme: ThemeDefinition = {
    id,
    name: name.trim(),
    ...(description.trim() ? { description: description.trim() } : {}),
    author: {
      name: authorName.trim(),
      ...(authorHandle.trim() ? { handle: authorHandle.trim().replace(/^@/, "") } : {}),
    },
    // Keep the original's credit (e.g. Bluesky's palette license) with remixes.
    ...(base ? { source: `Based on "${base.name}"${base.source ? ` (${base.source})` : ""}` } : {}),
    tokens,
  };
  const problems = validateTheme(theme);
  const source = themeDefinitionSource(theme);

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Share your theme so anyone making an Apollo site can pick it. This makes the file to add to
        the community themes collection.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput
          label="Theme name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          help={`Its id will be “${id}”.`}
        />
        <TextInput
          label="Short description (optional)"
          value={description}
          maxLength={140}
          onChange={(e) => setDescription(e.target.value)}
        />
        <TextInput
          label="Credit me as"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
        />
        <TextInput
          label="Bluesky handle (optional)"
          value={authorHandle}
          onChange={(e) => setAuthorHandle(e.target.value)}
        />
      </div>
      {problems.length ? (
        <Notice tone="warn">
          <p className="font-medium">Fix these before sharing:</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p.replace(/^theme "[^"]*": /, "")}</li>
            ))}
          </ul>
        </Notice>
      ) : (
        <Notice tone="success">This theme passes the community checks.</Notice>
      )}
      <CodeBlock text={source} label="Community theme file" />
      <CopyDownload text={source} filename={`${id}.ts`} type="text/plain" />
      <p className="text-xs text-neutral-500">
        Next: add this file to the community themes collection on GitHub.{" "}
        <a
          href={CONTRIBUTING_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sky-700 hover:underline dark:text-sky-400"
        >
          Step-by-step guide <ExternalLink size={12} aria-hidden />
        </a>
      </p>
    </div>
  );
}

function CssExport({ tokens }: { tokens: ThemeTokens }) {
  const fonts = googleFontFamilies(tokens);
  const fontNote = fonts.length
    ? `/*
 * Fonts: on Apollo these load automatically. Elsewhere, add:
 * <link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts
   .map((f) => `family=${f.replace(/ /g, "+")}`)
   .join("&")}&display=swap">
 */
`
    : "";
  const css = `/* Generated by SonaSky Apollo from your theme. */\n${fontNote}${themeCss(tokens)}`;
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        This is the full stylesheet Apollo makes from your theme. Every color, font and size is a
        variable at the top, like <code>--apollo-accent</code>. To customize further, copy the parts
        you want into <strong>Advanced &rarr; Stylesheets</strong> and change them there - your CSS
        is applied after the theme.
      </p>
      <CodeBlock text={css} label="Theme CSS" />
      <CopyDownload text={css} filename="apollo-theme.css" type="text/css" />
    </div>
  );
}

export function ThemeExportButton(props: {
  tokens: ThemeTokens;
  basedOn?: string;
  handle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"community" | "css">("community");
  const tabClass = (t: typeof tab) =>
    `rounded-md px-3 py-1.5 text-sm ${
      tab === t
        ? "bg-sky-100 font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-100"
        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
    }`;
  return (
    <>
      <Button onClick={() => setOpen(true)}>Export</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Export your theme" wide>
        <div className="space-y-4">
          <div className="flex gap-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "community"}
              className={tabClass("community")}
              onClick={() => setTab("community")}
            >
              Share with the community
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "css"}
              className={tabClass("css")}
              onClick={() => setTab("css")}
            >
              Get the CSS
            </button>
          </div>
          {tab === "community" ? (
            <CommunityExport {...props} />
          ) : (
            <CssExport tokens={props.tokens} />
          )}
        </div>
      </Modal>
    </>
  );
}
