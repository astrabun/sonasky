/**
 * The form for a community block (@sonasky/apollo-blocks), generated from the
 * fields its definition declares. Values are checked with the same
 * `normalizeFields` the Worker runs on save.
 */

import {
  findCommunityBlock,
  normalizeFields,
  type FieldDef,
  type MediaValue,
} from "@sonasky/apollo-blocks";
import type { CommunityBlock } from "../../shared/records.ts";
import { Notice, Select, TextArea, TextInput } from "../components/ui.tsx";
import { AltField, fromLocalInput, LinkHint, toLocalInput } from "./fieldParts.tsx";
import { MarkdownEditor } from "./MarkdownEditor.tsx";
import { MediaField } from "./MediaLibrary.tsx";

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  error: string | null;
  onChange: (value: unknown) => void;
}) {
  const text = typeof value === "string" ? value : "";
  switch (field.type) {
    case "text":
      return (
        <TextInput
          label={field.label}
          help={field.help}
          error={error}
          placeholder={field.placeholder}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "longText":
      return (
        <TextArea
          label={field.label}
          help={field.help}
          error={error}
          placeholder={field.placeholder}
          rows={field.rows ?? 3}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "markdown":
      return (
        <MarkdownEditor
          label={field.label}
          help={error ?? field.help}
          value={text}
          onChange={onChange}
        />
      );
    case "url":
      return (
        <div className="space-y-1">
          <TextInput
            label={field.label}
            help={field.help}
            type="url"
            placeholder="https://"
            value={text}
            onChange={(e) => onChange(e.target.value)}
          />
          <LinkHint value={text} />
        </div>
      );
    case "datetime":
      return (
        <TextInput
          label={field.label}
          help={field.help}
          error={error}
          type="datetime-local"
          value={toLocalInput(text)}
          onChange={(e) => onChange(fromLocalInput(e.target.value))}
        />
      );
    case "select":
      return (
        <Select
          label={field.label}
          help={field.help}
          value={text || field.default}
          options={[...field.options]}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <TextInput
          label={field.label}
          help={field.help}
          error={error}
          type="number"
          min={field.min}
          max={field.max}
          value={typeof value === "number" ? String(value) : String(field.default)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      );
    case "boolean":
      return (
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
            <input
              type="checkbox"
              checked={typeof value === "boolean" ? value : (field.default ?? false)}
              onChange={(e) => onChange(e.target.checked)}
            />
            {field.label}
          </label>
          {field.help ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{field.help}</p>
          ) : null}
        </div>
      );
    case "media": {
      const media = value as Partial<MediaValue> | undefined;
      return (
        <div className="space-y-3">
          <MediaField
            label={field.label}
            help={field.help}
            value={media?.media || undefined}
            onChange={(rkey, entry) =>
              onChange(
                rkey
                  ? {
                      media: rkey,
                      alt: entry?.value.alt ?? "",
                      ...(entry?.value.noAlt ? { noAlt: true } : {}),
                    }
                  : undefined,
              )
            }
          />
          {media?.media ? (
            <AltField
              value={media.alt ?? ""}
              noAlt={media.noAlt}
              onChange={(alt) => onChange({ ...media, alt })}
            />
          ) : null}
        </div>
      );
    }
  }
}

export function CommunityBlockFields({
  block,
  onChange,
}: {
  block: CommunityBlock;
  onChange: (b: CommunityBlock) => void;
}) {
  const def = findCommunityBlock(block.block);
  if (!def) {
    return (
      <Notice tone="warn">
        This community block (“{block.block}”) is no longer available, so it won't show on your
        page. You can remove it.
      </Notice>
    );
  }
  const fields = block.fields ?? {};
  const result = normalizeFields(def, fields);
  const errorFor = (key: string): string | null => {
    // Only flag what someone has typed; empty required fields are caught on save.
    const raw = fields[key];
    if (raw === undefined || raw === "" || result.ok) return null;
    return result.errors.find((e) => e.path === key)?.message ?? null;
  };
  return (
    <div className="space-y-3">
      {Object.entries(def.fields).map(([key, field]) => (
        <FieldInput
          key={key}
          field={field}
          value={fields[key]}
          error={errorFor(key)}
          onChange={(value) => {
            const next = { ...fields };
            if (value === undefined) delete next[key];
            else next[key] = value;
            onChange({ ...block, fields: next });
          }}
        />
      ))}
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Community block by {def.author.name}
        {def.author.handle ? ` (@${def.author.handle})` : ""}.
      </p>
    </div>
  );
}
