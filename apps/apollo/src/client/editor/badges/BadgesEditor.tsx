/**
 * The "88x31 Badges" block's form: pick your own badges, or add a friend's
 * by their handle or a share link. Badges are kept as at:// uris, so a
 * friend's badge always shows their current version.
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, UserRound } from "lucide-react";
import { parseBadgeUri } from "../../../shared/badges.ts";
import type { PublicBadge } from "../../../shared/dto.ts";
import { LIMITS } from "../../../shared/limits.ts";
import type { BadgesBlock } from "../../../shared/records.ts";
import { api, ApiFailure } from "../../api.ts";
import { Button, Modal, Notice, Select, TextInput } from "../../components/ui.tsx";
import { useEditorState } from "../context.tsx";
import { BadgeImage } from "./BadgesPanel.tsx";

/** Previews for every uri: your own from the editor's data, others' from the API. */
function useBadgePreviews(uris: string[]): {
  previews: Map<string, PublicBadge>;
  loading: boolean;
} {
  const { bundle } = useEditorState();
  const own = useMemo(() => {
    const media = new Map(bundle.media.map((m) => [m.rkey, m.url]));
    return new Map(
      bundle.badges.map((b): [string, PublicBadge] => [
        b.uri,
        {
          uri: b.uri,
          did: bundle.did,
          alt: b.value.alt,
          href: b.value.href,
          imageUrl: media.get(b.value.media) ?? "",
        },
      ]),
    );
  }, [bundle]);
  const [others, setOthers] = useState<Map<string, PublicBadge>>(new Map());
  const [loading, setLoading] = useState(false);

  const missing = uris.filter((u) => !own.has(u) && !others.has(u));
  const key = missing.join(" ");
  useEffect(() => {
    if (!key) return;
    let live = true;
    setLoading(true);
    api
      .resolveBadges(key.split(" "))
      .then((res) => {
        if (!live) return;
        setOthers((m) => {
          const next = new Map(m);
          for (const b of res.badges) next.set(b.uri, b);
          return next;
        });
      })
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [key]);

  return { previews: useMemo(() => new Map([...others, ...own]), [own, others]), loading };
}

function PickGrid({
  badges,
  taken,
  onPick,
}: {
  badges: PublicBadge[];
  taken: Set<string>;
  onPick: (b: PublicBadge) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {badges.map((b) => (
        <li key={b.uri}>
          <button
            type="button"
            disabled={taken.has(b.uri)}
            onClick={() => onPick(b)}
            className="w-full space-y-1 rounded-md border border-neutral-200 p-2 text-left hover:border-sky-400 disabled:opacity-40 dark:border-neutral-800"
          >
            <BadgeImage url={b.imageUrl || undefined} alt={b.alt} />
            <span className="block truncate text-xs">
              {taken.has(b.uri) ? "Added" : b.alt || "No description"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FriendPicker({ taken, onPick }: { taken: Set<string>; onPick: (b: PublicBadge) => void }) {
  const [actor, setActor] = useState("");
  const [found, setFound] = useState<{ name: string; badges: PublicBadge[] } | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const look = async () => {
    const a = actor.trim().replace(/^@/, "");
    if (!a) return;
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      const res = await api.badgesOf(a);
      if (!res.account) setError("Couldn't find that account, or its badges can't be shown.");
      else if (!res.badges.length) setError("They haven't made any 88x31 badges yet.");
      else setFound({ name: res.account.handle ?? a, badges: res.badges });
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't look that up.");
    } finally {
      setBusy(false);
    }
  };

  const addLink = async () => {
    const uri = shareLink.trim();
    if (!parseBadgeUri(uri)) {
      setError(
        "That isn't a badge share link. It starts with at:// - ask your friend to copy it from their Badges tab.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [badge] = (await api.resolveBadges([uri])).badges;
      if (!badge) setError("That badge doesn't exist any more, or can't be shown.");
      else {
        onPick(badge);
        setShareLink("");
      }
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : "Couldn't look that up.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void look();
        }}
      >
        <div className="flex-1">
          <TextInput
            label="Their handle"
            placeholder="alice.bsky.social"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy || !actor.trim()}>
          Find badges
        </Button>
      </form>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addLink();
        }}
      >
        <div className="flex-1">
          <TextInput
            label="Or paste a badge's share link"
            placeholder="at://did:plc:.../app.sonasky.apollo.badge/..."
            value={shareLink}
            onChange={(e) => setShareLink(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy || !shareLink.trim()}>
          Add
        </Button>
      </form>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {found ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">@{found.name}'s badges</p>
          <PickGrid badges={found.badges} taken={taken} onPick={onPick} />
        </div>
      ) : null}
    </div>
  );
}

export function BadgesEditor({
  block,
  onChange,
}: {
  block: BadgesBlock;
  onChange: (b: BadgesBlock) => void;
}) {
  const { bundle } = useEditorState();
  const [picker, setPicker] = useState<"own" | "friend" | null>(null);
  const uris = block.items.map((i) => i.uri);
  const { previews, loading } = useBadgePreviews(uris);
  const taken = new Set(uris);
  const full = uris.length >= LIMITS.badgesPerBlock;

  const add = (b: PublicBadge) => {
    if (taken.has(b.uri) || full) return;
    onChange({ ...block, items: [...block.items, { uri: b.uri }] });
  };
  const move = (i: number, d: -1 | 1) => {
    const items = [...block.items];
    [items[i], items[i + d]] = [items[i + d], items[i]];
    onChange({ ...block, items });
  };
  const own = bundle.badges.flatMap((b) => previews.get(b.uri) ?? []);

  return (
    <div className="space-y-3">
      {block.items.length === 0 ? (
        <p className="text-sm text-neutral-500">No badges yet.</p>
      ) : (
        <ul className="space-y-2">
          {block.items.map((item, i) => {
            const p = previews.get(item.uri);
            const mine = parseBadgeUri(item.uri)?.did === bundle.did;
            return (
              <li
                key={item.uri}
                className="flex items-center gap-3 rounded-md border border-neutral-200 p-2 dark:border-neutral-800"
              >
                {p ? (
                  <BadgeImage url={p.imageUrl || undefined} alt={p.alt} scale={1} />
                ) : (
                  <div className="flex h-[31px] w-[88px] flex-none items-center justify-center bg-neutral-100 text-[10px] text-neutral-500 dark:bg-neutral-800">
                    {loading ? "Loading..." : "Unavailable"}
                  </div>
                )}
                <div className="min-w-0 flex-1 text-xs">
                  <p className="truncate">
                    {p ? p.alt || "No description" : "Deleted, or can't be shown"}
                  </p>
                  <p className="truncate text-neutral-500">
                    {mine ? "Yours" : "A friend's"}
                    {p?.href ? ` · ${p.href}` : ""}
                  </p>
                </div>
                <div className="flex flex-none gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Move down"
                    disabled={i === block.items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Remove"
                    onClick={() =>
                      onChange({ ...block, items: block.items.filter((_, j) => j !== i) })
                    }
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={full} onClick={() => setPicker("own")}>
          <Plus size={14} /> Add your badges
        </Button>
        <Button size="sm" disabled={full} onClick={() => setPicker("friend")}>
          <UserRound size={14} /> Add a friend's badge
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Size"
          value={String(block.scale ?? 1)}
          options={[
            { value: "1", label: "Actual size (88x31)" },
            { value: "2", label: "Double (176x62)" },
          ]}
          onChange={(e) => onChange({ ...block, scale: e.target.value === "2" ? 2 : undefined })}
        />
        <Select
          label="Line up"
          value={block.align ?? "start"}
          options={[
            { value: "start", label: "Left" },
            { value: "center", label: "Center" },
          ]}
          onChange={(e) =>
            onChange({ ...block, align: e.target.value === "center" ? "center" : undefined })
          }
        />
      </div>

      <Modal open={picker === "own"} onClose={() => setPicker(null)} title="Add your badges" wide>
        {own.length ? (
          <PickGrid badges={own} taken={taken} onPick={add} />
        ) : (
          <p className="text-sm text-neutral-500">
            You haven't made any badges yet. Make one in the Badges tab.
          </p>
        )}
      </Modal>
      <Modal
        open={picker === "friend"}
        onClose={() => setPicker(null)}
        title="Add a friend's badge"
        wide
      >
        <FriendPicker taken={taken} onPick={add} />
      </Modal>
    </div>
  );
}
