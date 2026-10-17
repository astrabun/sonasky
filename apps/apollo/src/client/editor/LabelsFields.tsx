/**
 * Settings for the labels widget - shared by the labels block and the "Insert
 * labels" dialog in writing / HTML pages.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { PRESET_LABELERS, labelsPlaceholder } from "../../shared/labelers.ts";
import { LIMITS } from "../../shared/limits.ts";
import type { LabelsLayout } from "../../shared/records.ts";
import { labelerDidFrom, labelerSummaries, type LabelerSummary } from "../bsky.ts";
import { Button, Modal, TextInput } from "../components/ui.tsx";

export interface LabelsSettings {
  labelers: string[];
  layout?: LabelsLayout;
  title?: string;
}

export const DEFAULT_LABELS_SETTINGS: LabelsSettings = {
  labelers: PRESET_LABELERS.map((p) => p.did),
  layout: "grouped",
};

const isPreset = (did: string) => PRESET_LABELERS.some((p) => p.did === did);

function AddLabeler({ onAdd, disabled }: { onAdd: (did: string) => void; disabled: boolean }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onAdd(await labelerDidFrom(input));
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <TextInput
          label="Another labeler"
          help="Paste a labeler's Bluesky profile link, handle or DID."
          error={error}
          value={input}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="labeler.example.com"
        />
      </div>
      <Button size="sm" disabled={disabled || busy || !input.trim()} onClick={() => void add()}>
        <Plus size={14} /> {busy ? "Checking..." : "Add"}
      </Button>
    </div>
  );
}

export function LabelsFields({
  value,
  onChange,
}: {
  value: LabelsSettings;
  onChange: (v: LabelsSettings) => void;
}) {
  const { labelers } = value;
  const extras = labelers.filter((did) => !isPreset(did));
  const [names, setNames] = useState<Record<string, LabelerSummary>>({});
  const missing = extras.filter((did) => !names[did]).join(",");
  useEffect(() => {
    if (!missing) return;
    let cancelled = false;
    void labelerSummaries(missing.split(",")).then((found) => {
      if (cancelled) return;
      setNames((prev) => ({ ...prev, ...Object.fromEntries(found.map((s) => [s.did, s])) }));
    });
    return () => {
      cancelled = true;
    };
  }, [missing]);

  const full = labelers.length >= LIMITS.labelersPerBlock;
  const toggle = (did: string) =>
    onChange({
      ...value,
      labelers: labelers.includes(did) ? labelers.filter((d) => d !== did) : [...labelers, did],
    });
  const move = (did: string, d: -1 | 1) => {
    const i = labelers.indexOf(did);
    const j = i + d;
    if (i < 0 || j < 0 || j >= labelers.length) return;
    const next = [...labelers];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...value, labelers: next });
  };

  return (
    <div className="space-y-4">
      <TextInput
        label="Title (optional)"
        value={value.title ?? ""}
        onChange={(e) => onChange({ ...value, title: e.target.value || undefined })}
        placeholder="My labels"
      />
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Show labels from</legend>
        <p className="text-xs text-neutral-500">
          Labels these labelers have put on your Bluesky account.
        </p>
        {PRESET_LABELERS.map((p) => (
          <label key={p.did} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={labelers.includes(p.did)}
              disabled={!labelers.includes(p.did) && full}
              onChange={() => toggle(p.did)}
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      {extras.length > 0 ? (
        <ul className="space-y-2">
          {extras.map((did) => {
            const info = names[did];
            return (
              <li
                key={did}
                className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{info?.name ?? did}</div>
                  {info ? (
                    <div className="truncate text-xs text-neutral-500">@{info.handle}</div>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={labelers.indexOf(did) === 0}
                  onClick={() => move(did, -1)}
                  aria-label="Move labeler up"
                >
                  <ArrowUp size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={labelers.indexOf(did) === labelers.length - 1}
                  onClick={() => move(did, 1)}
                  aria-label="Move labeler down"
                >
                  <ArrowDown size={14} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(did)}>
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <AddLabeler
        disabled={full}
        onAdd={(did) =>
          onChange({ ...value, labelers: labelers.includes(did) ? labelers : [...labelers, did] })
        }
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.layout !== "combined"}
          onChange={(e) =>
            onChange({ ...value, layout: e.target.checked ? "grouped" : "combined" })
          }
        />
        Group by labeler
        <span className="text-xs text-neutral-500">(off: all labels in one row)</span>
      </label>
      {labelers.length === 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Pick at least one labeler, or nothing will show.
        </p>
      ) : null}
      <p className="text-xs text-neutral-500">
        Only labels you currently have are shown. If a labeler hasn't labeled you, its section is
        hidden.
      </p>
    </div>
  );
}

function InsertLabels({ onInsert }: { onInsert: (snippet: string) => void }) {
  const [value, setValue] = useState<LabelsSettings>({
    ...DEFAULT_LABELS_SETTINGS,
    labelers: [...DEFAULT_LABELS_SETTINGS.labelers],
  });
  return (
    <div className="space-y-4">
      <LabelsFields value={value} onChange={setValue} />
      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={value.labelers.length === 0}
          onClick={() => onInsert(labelsPlaceholder(value))}
        >
          Insert
        </Button>
      </div>
    </div>
  );
}

/** "Insert labels" dialog for writing / HTML pages; resolves with the placeholder snippet. */
export function useLabelsPicker() {
  const [resolve, setResolve] = useState<((snippet: string | null) => void) | null>(null);
  const pick = useCallback(() => new Promise<string | null>((res) => setResolve(() => res)), []);
  const finish = (snippet: string | null) => {
    resolve?.(snippet);
    setResolve(null);
  };
  const element = (
    <Modal open={resolve !== null} onClose={() => finish(null)} title="Insert your labels">
      <InsertLabels onInsert={finish} />
    </Modal>
  );
  return { pick, element };
}
