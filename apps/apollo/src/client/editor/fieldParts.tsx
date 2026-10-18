/** Small form pieces shared by the built-in and community block editors. */

import { classifyLink, linkValueError } from "../../shared/links.ts";
import { TextArea } from "../components/ui.tsx";

/** Small "visitors will see a warning" hint under link fields. */
export function LinkHint({ value }: { value: string }) {
  const err = value.trim() && value.trim() !== "https://" ? linkValueError(value) : null;
  if (err) return <p className="text-xs text-rose-600">{err}</p>;
  if (
    /^https?:/i.test(value.trim()) &&
    classifyLink(value, globalThis.location.origin).kind === "external"
  ) {
    return (
      <p className="text-xs text-neutral-500">
        This goes outside Apollo and Bluesky, so visitors will see a “you're leaving” notice first.
      </p>
    );
  }
  return null;
}

export function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/**
 * Alt text for a picture placed on a page. Prefilled from the upload; if the
 * uploader chose not to describe it, that choice carries over (and typing a
 * description here still wins).
 */
export function AltField({
  value,
  noAlt,
  onChange,
}: {
  value: string;
  noAlt?: boolean;
  onChange: (alt: string) => void;
}) {
  return (
    <TextArea
      label="Description (alt text)"
      rows={2}
      value={value}
      placeholder={noAlt ? "No description" : undefined}
      help={
        noAlt && !value.trim()
          ? "You chose not to describe this picture when you uploaded it. People using screen readers won't know what it shows."
          : "Describe the picture for people using screen readers."
      }
      error={!noAlt && !value.trim() ? "Add a description." : null}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
