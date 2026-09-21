import { useEffect, useState } from "react";
import { getRankHistory } from "./api";
import type { RankHistoryResponse } from "./types";

const WIDTH = 560;
const HEIGHT = 120;
const PAD_X = 8;
const PAD_Y = 12;

const formatAgo = (t: number): string => {
  const ms = Date.now() - t;
  if (ms < 60_000) return "just now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  return `${(mins / 60).toFixed(1)}h ago`;
};

/** Splits points into runs with no null gap, for drawing separate polyline segments. */
const toSegments = (points: RankHistoryResponse["points"]): { t: number; rank: number }[][] => {
  const segments: { t: number; rank: number }[][] = [];
  let current: { t: number; rank: number }[] = [];
  for (const p of points) {
    if (p.rank === null) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else {
      current.push({ t: p.t, rank: p.rank });
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
};

export function RankHistoryChart({ uri, feedUri }: { uri: string; feedUri: string }) {
  const [data, setData] = useState<RankHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    void getRankHistory(uri, feedUri).then((result) => {
      if (cancelled) return;
      setData(result ?? { kind: "all", points: [] });
      setIndex(result ? result.points.length - 1 : 0);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [uri, feedUri]);

  if (loading) {
    return <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">Loading history…</p>;
  }
  if (!data || data.points.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
        No history available for this feed yet.
      </p>
    );
  }

  const ranks = data.points.map((p) => p.rank).filter((r): r is number => r !== null);
  if (ranks.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
        Not ranked in this feed at any point in this window.
      </p>
    );
  }

  const isSnapshotBased = data.kind === "trending" || data.kind === "interacted";
  if (isSnapshotBased && data.points.length === 1) {
    return (
      <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
        Only one snapshot recorded so far (current rank #{ranks[0] + 1}) - this feed's history is
        captured every 15 minutes starting from when feed-generator began tracking it. Check back
        shortly for a trend.
      </p>
    );
  }

  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  const n = data.points.length;

  const xAt = (i: number) => PAD_X + (i / Math.max(n - 1, 1)) * (WIDTH - 2 * PAD_X);
  const yAt = (rank: number) =>
    PAD_Y + ((rank - minRank) / (maxRank - minRank || 1)) * (HEIGHT - 2 * PAD_Y);

  const segments = toSegments(data.points).map((seg) =>
    seg
      .map((p) => {
        const i = data.points.findIndex((dp) => dp.t === p.t);
        return `${xAt(i)},${yAt(p.rank)}`;
      })
      .join(" "),
  );

  const current = data.points[index];
  const cx = xAt(index);
  const cy = current.rank === null ? null : yAt(current.rank);

  return (
    <div className="px-4 py-3">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full text-blue-500 dark:text-blue-400"
        role="img"
        aria-label="Rank over time"
      >
        {segments.map((points, i) => (
          <polyline
            key={i}
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        <line
          x1={cx}
          x2={cx}
          y1={0}
          y2={HEIGHT}
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.3"
        />
        {cy !== null && <circle cx={cx} cy={cy} r="3" fill="currentColor" />}
      </svg>

      <input
        type="range"
        min={0}
        max={n - 1}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
        className="mt-1 w-full"
      />

      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {formatAgo(current.t)}:{" "}
        <span className="font-mono text-slate-700 dark:text-slate-300">
          {current.rank === null ? "not ranked" : `#${current.rank + 1}`}
        </span>
      </p>
    </div>
  );
}
