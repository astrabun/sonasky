import { useState } from "react";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { LIMITS } from "../../shared/limits.ts";
import { linkValueError } from "../../shared/links.ts";
import { SELF_LABEL_OPTIONS, type NavItem, type SiteRecord } from "../../shared/records.ts";
import { api, ApiFailure } from "../api.ts";
import { Button, Card, Notice, Select, TextArea, TextInput } from "../components/ui.tsx";
import { editable, useEditorState } from "./context.tsx";
import { MediaField } from "./MediaLibrary.tsx";

function NavEditor({ nav, onChange }: { nav: NavItem[]; onChange: (nav: NavItem[]) => void }) {
  const { bundle, site } = useEditorState();
  const pageOptions = bundle.pages.map((p) => ({ value: p.rkey, label: p.value.title || p.rkey }));
  const set = (i: number, item: NavItem) => onChange(nav.map((n, j) => (j === i ? item : n)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...nav];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {nav.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No menu. Visitors only see the page they land on.
        </p>
      ) : null}
      {nav.map((item, i) => {
        const isLink = item.page === undefined;
        return (
          <div
            key={i}
            className="space-y-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <TextInput
                label="Menu text"
                value={item.label}
                onChange={(e) => set(i, { ...item, label: e.target.value })}
              />
              <Select
                label="Goes to"
                value={isLink ? "__link" : item.page}
                onChange={(e) =>
                  set(
                    i,
                    e.target.value === "__link"
                      ? { label: item.label, url: "https://" }
                      : { label: item.label, page: e.target.value },
                  )
                }
                options={[...pageOptions, { value: "__link", label: "A web address..." }]}
              />
              {isLink ? (
                <TextInput
                  label="Address"
                  value={item.url ?? ""}
                  error={item.url ? linkValueError(item.url) : null}
                  onChange={(e) => set(i, { label: item.label, url: e.target.value })}
                />
              ) : null}
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label="Move up"
              >
                <ArrowUp size={14} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={i === nav.length - 1}
                onClick={() => move(i, 1)}
                aria-label="Move down"
              >
                <ArrowDown size={14} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange(nav.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={nav.length >= LIMITS.navItems}
          onClick={() => onChange([...nav, { label: "", page: site.value.homePage }])}
        >
          + Add menu item
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange(
              bundle.pages
                .slice(0, LIMITS.navItems)
                .map((p) => ({ label: p.value.title || p.rkey, page: p.rkey })),
            )
          }
        >
          Add all my pages
        </Button>
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const { bundle, site, setSite } = useEditorState();
  const [draft, setDraft] = useState<SiteRecord>(site.value);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<SiteRecord>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.putSite(editable(draft));
      setSite({ ...site, cid: res.cid, value: draft });
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't save settings.");
    } finally {
      setBusy(false);
    }
  };

  const labelSet = new Set(draft.labels?.values.map((v) => v.val) ?? []);
  const toggleLabel = (val: string) => {
    const next = new Set(labelSet);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    update({
      labels: next.size
        ? { $type: "com.atproto.label.defs#selfLabels", values: [...next].map((v) => ({ val: v })) }
        : undefined,
    });
  };

  const deleteSite = async () => {
    const answer = globalThis.prompt(
      "This deletes your whole site - every page, post, upload and setting - from your Bluesky account. Type DELETE to confirm.",
    );
    if (answer !== "DELETE") return;
    setBusy(true);
    try {
      await api.deleteSite();
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't delete the site.");
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Settings</h2>
        <Button variant="primary" disabled={!dirty || busy} onClick={save}>
          {busy ? (
            "Saving..."
          ) : dirty ? (
            "Publish settings"
          ) : (
            <>
              Published <Check size={14} aria-hidden />
            </>
          )}
        </Button>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice tone="success">Settings published.</Notice> : null}

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">About your site</h3>
        <TextInput
          label="Site name"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          maxLength={LIMITS.titleBytes}
        />
        <TextArea
          label="Description"
          help="A sentence or two about your site. Shown in link previews."
          rows={3}
          value={draft.description ?? ""}
          onChange={(e) => update({ description: e.target.value || undefined })}
        />
        <Select
          label="Home page"
          value={draft.homePage}
          onChange={(e) => update({ homePage: e.target.value })}
          options={bundle.pages.map((p) => ({ value: p.rkey, label: p.value.title || p.rkey }))}
        />
        <TextInput
          label="Language (optional)"
          help="A language code like en, es, de or pt-BR. Helps screen readers pronounce your site."
          value={draft.lang ?? ""}
          onChange={(e) => update({ lang: e.target.value || undefined })}
        />
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Menu</h3>
        <p className="text-xs text-neutral-500">The links shown at the top of every page.</p>
        <NavEditor
          nav={draft.nav ?? []}
          onChange={(nav) => update({ nav: nav.length ? nav : undefined })}
        />
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">Sharing</h3>
        <TextInput
          label="Title in link previews (optional)"
          value={draft.og?.title ?? ""}
          onChange={(e) => update({ og: { ...draft.og, title: e.target.value || undefined } })}
        />
        <TextArea
          label="Description in link previews (optional)"
          rows={2}
          value={draft.og?.description ?? ""}
          onChange={(e) =>
            update({ og: { ...draft.og, description: e.target.value || undefined } })
          }
        />
        <MediaField
          label="Share image"
          help="Shown when your site is shared on Bluesky, Discord and elsewhere. A wide image works best."
          value={draft.ogImage}
          onChange={(ogImage) => update({ ogImage })}
        />
        <MediaField
          label="Tab icon (favicon)"
          help="A small square image shown in browser tabs."
          value={draft.favicon}
          onChange={(favicon) => update({ favicon })}
        />
      </Card>

      <Card className="space-y-2">
        <h3 className="text-sm font-semibold">Content warning for the whole site</h3>
        <p className="text-xs text-neutral-500">
          If your site has adult or graphic content, check what applies. Visitors are asked before
          they see it.
        </p>
        {SELF_LABEL_OPTIONS.map((opt) => (
          <label key={opt.val} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={labelSet.has(opt.val)}
              onChange={() => toggleLabel(opt.val)}
            />
            {opt.label}
          </label>
        ))}
      </Card>

      <Card className="space-y-2 border-rose-200 dark:border-rose-900">
        <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-400">Delete site</h3>
        <p className="text-xs text-neutral-500">
          Removes your site and everything in it from your Bluesky account. Your Bluesky posts
          aren't affected.
        </p>
        <Button variant="danger" disabled={busy} onClick={deleteSite}>
          Delete my site...
        </Button>
      </Card>
    </div>
  );
}
