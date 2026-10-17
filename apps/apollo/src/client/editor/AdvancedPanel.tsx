/**
 * Advanced: hand-written CSS, scripts and layouts. Entirely optional - nothing
 * else in the editor depends on it.
 */

import { useState } from "react";
import type { Entry } from "../../shared/dto.ts";
import { LIMITS, utf8Bytes } from "../../shared/limits.ts";
import { NSID_LAYOUT, NSID_SCRIPT, NSID_STYLE, type SlugCollection } from "../../shared/nsid.ts";
import type { LayoutRecord, ScriptRecord, StyleRecord } from "../../shared/records.ts";
import { isSlug, slugify } from "../../shared/slug.ts";
import { api, ApiFailure } from "../api.ts";
import { Button, Card, Notice, SizeMeter, TextInput } from "../components/ui.tsx";
import { CodeEditor, type CodeLanguage } from "./CodeEditor.tsx";
import { editable, useEditorState } from "./context.tsx";
import { THEME_RKEY } from "./ThemePanel.tsx";

type CodeRecord = StyleRecord | ScriptRecord | LayoutRecord;

interface Kind {
  collection: SlugCollection;
  field: "css" | "js" | "html";
  language: CodeLanguage;
  max: number;
  maxRecords: number;
  noun: string;
  starter: string;
}

const KINDS: Record<"styles" | "scripts" | "layouts", Kind> = {
  styles: {
    collection: NSID_STYLE,
    field: "css",
    language: "css",
    max: LIMITS.styleCssBytes,
    maxRecords: LIMITS.stylesPerSite,
    noun: "stylesheet",
    starter: "/* Applies to pages that use this stylesheet. */\n",
  },
  scripts: {
    collection: NSID_SCRIPT,
    field: "js",
    language: "javascript",
    max: LIMITS.scriptJsBytes,
    maxRecords: LIMITS.scriptsPerSite,
    noun: "script",
    starter:
      "// Runs on pages that use this script.\ndocument.addEventListener('DOMContentLoaded', () => {\n  \n});\n",
  },
  layouts: {
    collection: NSID_LAYOUT,
    field: "html",
    language: "html",
    max: LIMITS.layoutHtmlBytes,
    maxRecords: LIMITS.layoutsPerSite,
    noun: "layout",
    starter:
      '<div class="apollo-wrap">\n  <header class="apollo-header">\n    <strong>{{site.title}}</strong>\n    {{nav}}\n  </header>\n  <main>{{content}}</main>\n</div>\n',
  },
};

function CodeRecordEditor({
  kind,
  entry,
  onDone,
}: {
  kind: Kind;
  entry: Entry<CodeRecord> | null;
  onDone: () => void;
}) {
  const { bundle, upsert } = useEditorState();
  const [name, setName] = useState(entry?.value.name ?? "");
  const [code, setCode] = useState<string>(
    entry ? ((entry.value as unknown as Record<string, string>)[kind.field] ?? "") : kind.starter,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rkey = entry?.rkey ?? slugify(name || kind.noun);
  const list = bundle[
    kind.collection === NSID_STYLE
      ? "styles"
      : kind.collection === NSID_SCRIPT
        ? "scripts"
        : "layouts"
  ] as Entry<CodeRecord>[];
  const clash = !entry && list.some((e) => e.rkey === rkey);
  const bytes = utf8Bytes(code);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const base = entry ? editable(entry.value) : {};
      const record = { ...base, name: name || rkey, [kind.field]: code };
      const res = await api.putRecord(kind.collection, rkey, record);
      upsert(kind.collection, {
        rkey,
        cid: res.cid,
        value: { ...record, $type: kind.collection, updatedAt: new Date().toISOString() },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <TextInput
        label="Name"
        value={name}
        disabled={entry?.rkey === THEME_RKEY}
        onChange={(e) => setName(e.target.value)}
        error={
          clash
            ? `You already have a ${kind.noun} called that.`
            : !isSlug(rkey)
              ? "Use letters and numbers."
              : null
        }
      />
      <CodeEditor
        label={`${kind.noun} code`}
        language={kind.language}
        value={code}
        onChange={setCode}
        minHeight="18rem"
      />
      <SizeMeter label="Size" used={bytes} max={kind.max} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={busy || clash || bytes > kind.max || !isSlug(rkey)}
          onClick={save}
        >
          {busy ? "Publishing..." : "Publish"}
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </Card>
  );
}

function CodeRecordList({ which }: { which: keyof typeof KINDS }) {
  const kind = KINDS[which];
  const { bundle, site, setSite, remove } = useEditorState();
  const entries = bundle[which] as Entry<CodeRecord>[];
  const [editing, setEditing] = useState<Entry<CodeRecord> | "new" | null>(null);

  if (editing) {
    return (
      <CodeRecordEditor
        key={editing === "new" ? "new" : editing.rkey}
        kind={kind}
        entry={editing === "new" ? null : editing}
        onDone={() => setEditing(null)}
      />
    );
  }

  const del = async (e: Entry<CodeRecord>) => {
    if (!globalThis.confirm(`Delete "${e.value.name}"? Pages using it will stop using it.`)) return;
    try {
      await api.deleteRecord(kind.collection, e.rkey);
      remove(kind.collection, e.rkey);
    } catch (err) {
      globalThis.alert(err instanceof ApiFailure ? err.message : "Couldn't delete.");
    }
  };

  const setDefaultLayout = async (rkey: string | undefined) => {
    try {
      const res = await api.putSite({ ...editable(site.value), defaultLayout: rkey });
      setSite({ ...site, cid: res.cid, value: { ...site.value, defaultLayout: rkey } });
    } catch (err) {
      globalThis.alert(
        err instanceof ApiFailure ? err.message : "Couldn't change the default layout.",
      );
    }
  };

  return (
    <div className="space-y-2">
      {entries.length === 0 ? <p className="text-sm text-neutral-500">None yet.</p> : null}
      <ul className="space-y-2">
        {entries.map((e) => (
          <li key={e.rkey}>
            <Card className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {e.rkey === THEME_RKEY ? "Theme (custom CSS added to your theme)" : e.value.name}
                {which === "layouts" && site.value.defaultLayout === e.rkey ? (
                  <span className="ml-2 text-xs text-sky-700 dark:text-sky-400">Default</span>
                ) : null}
              </span>
              <span className="flex gap-1">
                <Button size="sm" onClick={() => setEditing(e)}>
                  Edit
                </Button>
                {which === "layouts" ? (
                  site.value.defaultLayout === e.rkey ? (
                    <Button size="sm" variant="ghost" onClick={() => setDefaultLayout(undefined)}>
                      Stop using as default
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setDefaultLayout(e.rkey)}>
                      Use for all pages
                    </Button>
                  )
                ) : null}
                {e.rkey !== THEME_RKEY ? (
                  <Button size="sm" variant="ghost" onClick={() => del(e)}>
                    Delete
                  </Button>
                ) : null}
              </span>
            </Card>
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        disabled={entries.length >= kind.maxRecords}
        onClick={() => setEditing("new")}
      >
        + New {kind.noun}
      </Button>
    </div>
  );
}

export function AdvancedPanel() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Advanced</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Optional tools for people who like writing code. You never need these to make a great
          site.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="font-semibold">Stylesheets (CSS)</h3>
        <p className="text-sm text-neutral-500">
          Edit <em>Theme</em> to add CSS to every page, or make extra stylesheets and pick them per
          page under a page's Advanced section. Images and fonts from other websites won't load.
        </p>
        <CodeRecordList which="styles" />
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Scripts (JavaScript)</h3>
        <Notice>
          Limited scripts are available if needed. They can't load code or data from other websites,
          send data anywhere, open pop-ups, or move visitors to another page. Like everything on
          your site, scripts are public and can be reported.
        </Notice>
        <CodeRecordList which="scripts" />
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Layouts (HTML)</h3>
        <p className="text-sm text-neutral-500">
          A layout wraps every page. Use <code>{"{{content}}"}</code> where the page goes, plus
          optional <code>{"{{nav}}"}</code>, <code>{"{{title}}"}</code> and{" "}
          <code>{"{{site.title}}"}</code>.
        </p>
        <CodeRecordList which="layouts" />
      </section>
    </div>
  );
}
