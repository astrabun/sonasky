import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { Check, ExternalLink, Tags } from "lucide-react";
import { useNavigate } from "react-router";
import type { Entry } from "../../shared/dto.ts";
import { jsonBytes, LIMITS, utf8Bytes } from "../../shared/limits.ts";
import { NSID_PAGE, NSID_POST } from "../../shared/nsid.ts";
import {
  SELF_LABEL_OPTIONS,
  type ContentComments,
  type PageFormat,
  type PageRecord,
  type PostRecord,
  type SelfLabels,
  type SiteRecord,
} from "../../shared/records.ts";
import { isSlug, RESERVED_PAGE_SLUGS, slugify } from "../../shared/slug.ts";
import { api, ApiFailure } from "../api.ts";
import { Button, Card, Notice, Select, SizeMeter, TextArea, TextInput } from "../components/ui.tsx";
import { BlockList, CommentsPostField, CommentsSortField } from "./blocks.tsx";
import { CodeEditor } from "./CodeEditor.tsx";
import { editable, useEditorState } from "./context.tsx";
import { useLabelsPicker } from "./LabelsFields.tsx";
import { MarkdownEditor, type MarkdownImages } from "./MarkdownEditor.tsx";
import { MediaField, useMediaPicker } from "./MediaLibrary.tsx";
import { Preview } from "./Preview.tsx";

type Kind = "page" | "post";
type Draft = Omit<PageRecord, "$type"> & Partial<Pick<PostRecord, "publishedAt" | "tags">>;

const DRAFT_PREFIX = "apollo:draft:";

function draftKey(did: string, kind: Kind, slug: string): string {
  return `${DRAFT_PREFIX}${did}:${kind}:${slug}`;
}

function readDraft(key: string): { savedAt: string; slug: string; record: Draft } | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { savedAt: string; slug: string; record: Draft }) : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, slug: string, record: Draft): void {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), slug, record }));
  } catch {
    // Storage full or blocked - drafts are a convenience only.
  }
}

function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function emptyDraft(kind: Kind, site: SiteRecord): Draft {
  const commentsOn = kind === "post" ? site.commentsDefaults?.posts : site.commentsDefaults?.pages;
  return {
    ...(commentsOn ? { comments: {} } : {}),
    title: "",
    format: kind === "post" ? "markdown" : "blocks",
    blocks: kind === "post" ? undefined : [],
    body: kind === "post" ? "" : undefined,
    createdAt: "",
    updatedAt: "",
    ...(kind === "post" ? { publishedAt: new Date().toISOString() } : {}),
  };
}

const FORMAT_OPTIONS: { value: PageFormat; label: string }[] = [
  { value: "blocks", label: "Blocks (easiest)" },
  { value: "markdown", label: "Writing (formatted text / Markdown)" },
  { value: "html", label: "HTML code (advanced)" },
];

function CommentsSetting({
  kind,
  comments,
  onChange,
}: {
  kind: Kind;
  comments?: ContentComments;
  onChange: (c?: ContentComments) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Comments</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(comments)}
          onChange={(e) => onChange(e.target.checked ? {} : undefined)}
        />
        Show replies from Bluesky as comments under this {kind}
      </label>
      {comments ? (
        <>
          <CommentsPostField
            post={comments.post}
            onChange={(post) => onChange({ ...comments, post })}
          />
          <CommentsSortField
            sort={comments.sort}
            onChange={(sort) => onChange({ ...comments, sort })}
          />
        </>
      ) : null}
    </fieldset>
  );
}

function ContentWarnings({
  labels,
  onChange,
}: {
  labels?: SelfLabels;
  onChange: (l?: SelfLabels) => void;
}) {
  const active = new Set(labels?.values.map((v) => v.val) ?? []);
  const toggle = (val: string) => {
    const next = new Set(active);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    onChange(
      next.size
        ? { $type: "com.atproto.label.defs#selfLabels", values: [...next].map((v) => ({ val: v })) }
        : undefined,
    );
  };
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">Content warning</legend>
      <p className="text-xs text-neutral-500">Visitors will be asked before they see this page.</p>
      {SELF_LABEL_OPTIONS.map((opt) => (
        <label key={opt.val} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active.has(opt.val)} onChange={() => toggle(opt.val)} />
          {opt.label}
        </label>
      ))}
    </fieldset>
  );
}

export function PageEditor({
  kind,
  entry,
}: {
  kind: Kind;
  entry: Entry<PageRecord | PostRecord> | null;
}) {
  const { bundle, site, upsert, setSite } = useEditorState();
  const picker = useMediaPicker("image");
  const images: MarkdownImages = {
    pick: picker.pick,
    urlFor: (id) => bundle.media.find((m) => m.rkey === id)?.url,
  };
  const labelsPicker = useLabelsPicker();
  const htmlView = useRef<EditorView | null>(null);
  const insertLabelsInHtml = async () => {
    const snippet = await labelsPicker.pick();
    const view = htmlView.current;
    if (!snippet || !view) return;
    view.dispatch(view.state.replaceSelection(snippet));
    view.focus();
  };
  const navigate = useNavigate();
  const collection = kind === "post" ? NSID_POST : NSID_PAGE;
  const isNew = entry === null;

  const [slug, setSlug] = useState(entry?.rkey ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [draft, setDraft] = useState<Draft>(() =>
    entry ? editable(entry.value) : emptyDraft(kind, site.value),
  );
  const [blocksKey, setBlocksKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const storageKey = draftKey(bundle.did, kind, entry?.rkey ?? "__new__");
  const [pendingRestore, setPendingRestore] = useState(() => {
    const saved = readDraft(storageKey);
    if (!saved) return null;
    if (entry && saved.savedAt <= entry.value.updatedAt) return null;
    return saved;
  });

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setSavedNote(null);
  };

  useEffect(() => {
    if (dirty) writeDraft(storageKey, slug, draft);
  }, [dirty, draft, slug, storageKey]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // New pages get a slug from the title until the author edits it themselves.
  const effectiveSlug = isNew && !slugTouched ? slugify(draft.title || "page") : slug;
  const slugError = !isSlug(effectiveSlug)
    ? "Use lowercase letters, numbers and dashes."
    : kind === "page" && RESERVED_PAGE_SLUGS.has(effectiveSlug)
      ? `"${effectiveSlug}" is reserved. Pick another.`
      : isNew &&
          (kind === "post" ? bundle.posts : bundle.pages).some((p) => p.rkey === effectiveSlug)
        ? "You already have one with this address."
        : null;

  const recordForSave = useMemo(() => {
    const r: Draft = { ...draft };
    if (r.format === "blocks") {
      r.body = undefined;
      r.blocks = r.blocks ?? [];
    } else {
      r.blocks = undefined;
      r.body = r.body ?? "";
    }
    return r;
  }, [draft]);

  const recordBytes = jsonBytes(recordForSave);
  const bodyBytes = recordForSave.body ? utf8Bytes(recordForSave.body) : 0;
  const isHome = kind === "page" && entry?.rkey === site.value.homePage;
  const viewPath = kind === "post" ? `/blog/${effectiveSlug}` : isHome ? "" : `/${effectiveSlug}`;

  const changeFormat = (format: PageFormat) => {
    if (format === draft.format) return;
    if (draft.format === "blocks" && (draft.blocks?.length ?? 0) > 0) {
      if (
        !globalThis.confirm(
          "Switching away from blocks starts this page's content over. Your blocks will be removed. Continue?",
        )
      ) {
        return;
      }
    }
    update({
      format,
      blocks: format === "blocks" ? [] : undefined,
      body: format === "blocks" ? undefined : (draft.body ?? ""),
    });
    setBlocksKey((k) => k + 1);
  };

  const publish = async () => {
    if (slugError || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.putRecord(collection, effectiveSlug, recordForSave);
      const now = new Date().toISOString();
      const value = {
        ...recordForSave,
        $type: collection,
        createdAt: recordForSave.createdAt || now,
        updatedAt: now,
        ...(kind === "post" ? { publishedAt: recordForSave.publishedAt ?? now } : {}),
      } as PageRecord | PostRecord;
      upsert(collection, { rkey: effectiveSlug, cid: res.cid, value });
      clearDraft(storageKey);
      setDirty(false);
      setPendingRestore(null);
      setSavedNote("Published! Changes can take up to a minute to show up for visitors.");
      if (isNew) {
        // A page that isn't in the navigation yet is easy to lose; offer to add it.
        if (
          kind === "page" &&
          site.value.nav &&
          globalThis.confirm("Add this page to your site's menu?")
        ) {
          const nav = [...site.value.nav, { label: recordForSave.title, page: effectiveSlug }];
          const siteRes = await api.putSite({ ...editable(site.value), nav });
          setSite({ ...site, cid: siteRes.cid, value: { ...site.value, nav } });
        }
        void navigate(`/edit/${kind === "post" ? "blog" : "pages"}/${effectiveSlug}`, {
          replace: true,
        });
      }
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't publish. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const previewTarget = useMemo(
    () =>
      isSlug(effectiveSlug)
        ? kind === "post"
          ? {
              kind: "post" as const,
              slug: effectiveSlug,
              record: {
                ...recordForSave,
                $type: NSID_POST,
                publishedAt: recordForSave.publishedAt ?? new Date().toISOString(),
              } as PostRecord,
            }
          : {
              kind: "page" as const,
              slug: effectiveSlug,
              record: { ...recordForSave, $type: NSID_PAGE } as PageRecord,
            }
        : null,
    [effectiveSlug, kind, recordForSave],
  );

  return (
    <div className="space-y-4">
      {pendingRestore ? (
        <Notice tone="warn">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              You have unpublished changes from {new Date(pendingRestore.savedAt).toLocaleString()}.
            </span>
            <span className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setDraft(pendingRestore.record);
                  if (isNew && pendingRestore.slug) {
                    setSlug(pendingRestore.slug);
                    setSlugTouched(true);
                  }
                  setBlocksKey((k) => k + 1);
                  setDirty(true);
                  setPendingRestore(null);
                }}
              >
                Restore them
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  clearDraft(storageKey);
                  setPendingRestore(null);
                }}
              >
                Discard
              </Button>
            </span>
          </div>
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {isNew ? (kind === "post" ? "New post" : "New page") : draft.title || effectiveSlug}
          {isHome ? (
            <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900 dark:text-sky-100">
              Home page
            </span>
          ) : null}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowPreview((s) => !s)}>
            {showPreview ? "Hide preview" : "Show preview"}
          </Button>
          {!isNew ? (
            <a
              className="inline-flex items-center gap-1 text-sm text-sky-700 hover:underline dark:text-sky-400"
              href={`${bundle.siteUrl}${viewPath}`}
              target="_blank"
              rel="noreferrer"
            >
              View live <ExternalLink size={14} aria-hidden />
            </a>
          ) : null}
          <Button
            variant="primary"
            disabled={busy || Boolean(slugError) || recordBytes > LIMITS.recordJsonBytes}
            onClick={publish}
          >
            {busy ? (
              "Publishing..."
            ) : dirty || isNew ? (
              "Publish"
            ) : (
              <>
                Published <Check size={14} aria-hidden />
              </>
            )}
          </Button>
        </div>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {savedNote ? <Notice tone="success">{savedNote}</Notice> : null}

      <div className={showPreview ? "grid grid-cols-1 gap-6 xl:grid-cols-2" : ""}>
        <div className="space-y-4">
          <Card className="space-y-3">
            <TextInput
              label={kind === "post" ? "Post title" : "Page title"}
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              maxLength={LIMITS.titleBytes}
            />
            <TextInput
              label="Web address"
              help={
                isNew
                  ? `Your ${kind} will be at ${bundle.siteUrl}${kind === "post" ? "/blog" : ""}/${effectiveSlug}`
                  : "The address can't be changed after publishing. (Make a new page instead.)"
              }
              error={isNew ? slugError : null}
              value={effectiveSlug}
              disabled={!isNew}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
            />
            <TextArea
              label="Short description (optional)"
              help="Shown when someone shares a link to this page."
              rows={2}
              value={draft.description ?? ""}
              onChange={(e) => update({ description: e.target.value || undefined })}
            />
            {kind === "post" ? (
              <TextInput
                label="Tags (optional)"
                help="Separate with commas."
                value={(draft.tags ?? []).join(", ")}
                onChange={(e) =>
                  update({
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                      .slice(0, LIMITS.tagsPerPost),
                  })
                }
              />
            ) : null}
            <Select
              label="How do you want to build this?"
              value={draft.format}
              onChange={(e) => changeFormat(e.target.value as PageFormat)}
              options={FORMAT_OPTIONS}
            />
          </Card>

          {draft.format === "blocks" ? (
            <BlockList
              key={blocksKey}
              blocks={draft.blocks ?? []}
              onChange={(blocks) => update({ blocks })}
            />
          ) : draft.format === "markdown" ? (
            <Card className="space-y-3">
              <MarkdownEditor
                key={blocksKey}
                label="Content"
                minHeight="20rem"
                value={draft.body ?? ""}
                onChange={(body) => update({ body })}
                images={images}
                labels={labelsPicker}
                help="Link to your other pages with /page-name. Add pictures with the image button, or type ![description](media:ID) - Media shows each file's ID and a Copy Markdown button."
              />
              {picker.element}
              {labelsPicker.element}
              <SizeMeter label="Content size" used={bodyBytes} max={LIMITS.pageBodyBytes} />
            </Card>
          ) : (
            <Card className="space-y-3">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Write HTML for the page body. Scripts, forms, iframes and external images are
                removed - add scripts in <strong>Advanced &rarr; Scripts</strong> instead.
              </p>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => void insertLabelsInHtml()}>
                  <Tags size={14} aria-hidden /> Insert your labels
                </Button>
              </div>
              <CodeEditor
                key={blocksKey}
                label="Page HTML"
                language="html"
                minHeight="20rem"
                value={draft.body ?? ""}
                onChange={(body) => update({ body })}
                onView={(view) => {
                  htmlView.current = view;
                }}
              />
              {labelsPicker.element}
              <SizeMeter label="Content size" used={bodyBytes} max={LIMITS.pageBodyBytes} />
            </Card>
          )}

          <Card className="space-y-4">
            <SizeMeter label="Total size" used={recordBytes} max={LIMITS.recordJsonBytes} />
            <CommentsSetting
              kind={kind}
              comments={draft.comments}
              onChange={(comments) => update({ comments })}
            />
            <ContentWarnings labels={draft.labels} onChange={(labels) => update({ labels })} />
            <MediaField
              label="Share image (optional)"
              help="The picture shown when this page is shared. Falls back to your site's share image."
              value={draft.ogImage}
              onChange={(ogImage) => update({ ogImage })}
            />
            <div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAdvanced((s) => !s)}
                aria-expanded={showAdvanced}
              >
                {showAdvanced ? "▾" : "▸"} Advanced
              </Button>
              {showAdvanced ? (
                <div className="mt-3 space-y-3">
                  <Select
                    label="Layout"
                    value={draft.layout ?? ""}
                    onChange={(e) => update({ layout: e.target.value || undefined })}
                    options={[
                      { value: "", label: "Site default" },
                      ...bundle.layouts.map((l) => ({ value: l.rkey, label: l.value.name })),
                    ]}
                  />
                  <RecordChecklist
                    legend="Extra stylesheets"
                    empty="No extra stylesheets yet - make one in Advanced."
                    options={bundle.styles
                      .filter((s) => s.rkey !== site.value.theme)
                      .map((s) => ({ value: s.rkey, label: s.value.name }))}
                    selected={draft.styles ?? []}
                    max={LIMITS.stylesPerPage}
                    onChange={(styles) => update({ styles: styles.length ? styles : undefined })}
                  />
                  <RecordChecklist
                    legend="Scripts"
                    empty="No scripts yet - make one in Advanced."
                    options={bundle.scripts.map((s) => ({ value: s.rkey, label: s.value.name }))}
                    selected={draft.scripts ?? []}
                    max={LIMITS.scriptsPerPage}
                    onChange={(scripts) =>
                      update({ scripts: scripts.length ? scripts : undefined })
                    }
                  />
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        {showPreview ? (
          <div className="xl:sticky xl:top-[calc(var(--banner-h,0px)+1rem)] xl:self-start">
            <Preview target={previewTarget} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RecordChecklist({
  legend,
  empty,
  options,
  selected,
  max,
  onChange,
}: {
  legend: string;
  empty: string;
  options: { value: string; label: string }[];
  selected: string[];
  max: number;
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">{legend}</legend>
      {options.length === 0 ? <p className="text-xs text-neutral-500">{empty}</p> : null}
      {options.map((o) => {
        const checked = selected.includes(o.value);
        return (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              disabled={!checked && selected.length >= max}
              onChange={() =>
                onChange(checked ? selected.filter((v) => v !== o.value) : [...selected, o.value])
              }
            />
            {o.label}
          </label>
        );
      })}
    </fieldset>
  );
}
