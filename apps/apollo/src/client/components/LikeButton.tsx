import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import type { MeResponse } from "../../shared/dto.ts";
import { api, ApiFailure, likeSignInHref } from "../api.ts";

function goSignIn() {
  window.location.assign(likeSignInHref(`${window.location.pathname}${window.location.search}`));
}

/**
 * Heart + count for a site. `count` comes from the directory when known; the
 * button fetches it (and whether the viewer likes the site) otherwise. Toggles
 * optimistically; signed-out visitors are sent to sign in first.
 */
export function LikeButton({
  site,
  count: initialCount,
  me,
}: {
  site: string;
  count?: number;
  me: MeResponse | null;
}) {
  const canLike = me?.authenticated === true && me.canLike;
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCount(initialCount);
    setLiked(false);
    if (initialCount !== undefined && !canLike) return;
    let live = true;
    api
      .likeStatus(site)
      .then((res) => {
        if (!live) return;
        // The backlink index lags a little; never show fewer likes than the viewer's own.
        setCount(Math.max(res.count, res.liked ? 1 : 0, initialCount ?? 0));
        setLiked(res.liked);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [site, initialCount, canLike]);

  const toggle = async () => {
    if (!canLike) return goSignIn();
    const next = !liked;
    setBusy(true);
    setLiked(next);
    setCount((c) => Math.max(0, (c ?? 0) + (next ? 1 : -1)));
    try {
      await (next ? api.like(site) : api.unlike(site));
    } catch (err) {
      setLiked(!next);
      setCount((c) => Math.max(0, (c ?? 0) + (next ? -1 : 1)));
      if (
        err instanceof ApiFailure &&
        (err.code === "unauthenticated" || err.code === "reauth_required")
      ) {
        goSignIn();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={liked}
      aria-label={liked ? "Unlike this site" : "Like this site"}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
        liked
          ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
          : "border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
      }`}
    >
      <Heart size={16} aria-hidden fill={liked ? "currentColor" : "none"} />
      {count ?? ""}
    </button>
  );
}
