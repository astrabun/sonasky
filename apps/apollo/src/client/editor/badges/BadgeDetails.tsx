/** A badge's description and link, shared by the maker, uploads and quick edits. */

import { badgeHrefError } from "../../../shared/badges.ts";
import { LIMITS } from "../../../shared/limits.ts";
import { TextInput } from "../../components/ui.tsx";
import { LinkHint } from "../fieldParts.tsx";

export interface BadgeDetails {
  alt: string;
  noAlt: boolean;
  href: string;
}

/** Why these details can't be saved yet, or null. */
export function badgeDetailsError(d: BadgeDetails): string | null {
  if (!d.noAlt && !d.alt.trim()) return "Add a description.";
  if (d.href.trim()) return badgeHrefError(d.href);
  return null;
}

export function BadgeDetailsFields({
  value,
  onChange,
}: {
  value: BadgeDetails;
  onChange: (d: BadgeDetails) => void;
}) {
  const hrefError = value.href.trim() ? badgeHrefError(value.href) : null;
  return (
    <div className="space-y-3">
      {value.noAlt ? (
        <p className="text-xs text-neutral-500">
          No description. People using screen readers won't know what this badge says.
        </p>
      ) : (
        <TextInput
          label="Description (alt text)"
          help="Usually just what the badge says, like “Alice's art blog”. Also shown when someone hovers over it."
          value={value.alt}
          maxLength={LIMITS.altBytes}
          onChange={(e) => onChange({ ...value, alt: e.target.value })}
        />
      )}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={value.noAlt}
          onChange={(e) => onChange({ ...value, noAlt: e.target.checked })}
        />
        <span>I'm choosing not to add a description</span>
      </label>
      <div className="space-y-1">
        <TextInput
          label="Link (optional)"
          placeholder="https://... or a page on your site, like about"
          help="Where the badge goes when clicked - wherever it's shown, including on other people's sites."
          value={value.href}
          maxLength={LIMITS.urlBytes}
          error={hrefError}
          onChange={(e) => onChange({ ...value, href: e.target.value })}
        />
        {hrefError ? null : <LinkHint value={value.href} />}
      </div>
    </div>
  );
}
