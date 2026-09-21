import { useEffect, useState } from "react";
import { getCursors } from "./api";
import type { CursorsResponse } from "./types";

const REFRESH_MS = 5_000;

const formatLag = (lagMs: number | null): string => {
  if (lagMs === null) return "no cursor yet";
  if (lagMs < 0) return "ahead of now (!)";
  if (lagMs < 60_000) return "caught up (< 1m behind)";
  const hours = lagMs / 3_600_000;
  if (hours < 1) return `${Math.round(lagMs / 60_000)}m behind`;
  return `${hours.toFixed(1)}h behind`;
};

export function CursorStatus() {
  const [data, setData] = useState<CursorsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const result = await getCursors();
      if (!cancelled && result) setData(result);
    };

    void load();
    const interval = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!data) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      {data.streams.map((s) => (
        <span key={s.key}>
          <span className="font-medium">{s.name}</span>: {formatLag(s.lagMs)}
        </span>
      ))}
    </div>
  );
}
