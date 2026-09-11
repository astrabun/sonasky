import { useState } from "react";
import { EventCard } from "./components/EventCard";
import { NsfwToggle } from "./components/NsfwToggle";
import { REWIND_OPTIONS } from "./const";
import { useFirehose } from "./hooks/useFirehose";

const NSFW_STORAGE_KEY = "nsfw-visible";

export function App() {
  const { events, fadingIds, isRewinding, jumpToNow, lastEventTimeUs, rewind } = useFirehose();

  const cursorLabel =
    lastEventTimeUs > 0
      ? new Date(lastEventTimeUs / 1000).toLocaleString(undefined, {
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          month: "short",
          second: "2-digit",
        })
      : undefined;

  // More reliable than `connected`, which flickers during automatic reconnections.
  const isActive = lastEventTimeUs > 0 && Date.now() * 1000 - lastEventTimeUs < 10 * 1000 * 1000;

  const [nsfwVisible, setNsfwVisible] = useState(
    () => localStorage.getItem(NSFW_STORAGE_KEY) === "true",
  );

  const toggleNsfw = () => {
    setNsfwVisible((prev) => {
      const next = !prev;
      localStorage.setItem(NSFW_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white">
      <header className="sticky top-0 z-10 bg-neutral-900/90 backdrop-blur-sm border-b border-neutral-800 px-4 py-2.5">
        <div className="max-w-2xl mx-auto space-y-1.5">
          <h1 className="text-base font-semibold tracking-tight">sonasky-ref firehose</h1>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value=""
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val > 0) {
                      rewind(val);
                    }
                  }}
                  className="appearance-none cursor-pointer bg-neutral-700 text-neutral-300 text-sm pl-3 pr-7 py-1.5 rounded-full font-medium hover:bg-neutral-600 transition-colors"
                >
                  <option value="" disabled>
                    Rewind
                  </option>
                  {REWIND_OPTIONS.map((opt) => (
                    <option key={opt.durationMs} value={opt.durationMs}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">
                  ▾
                </span>
              </div>
              {isRewinding && (
                <button
                  onClick={jumpToNow}
                  className="text-sm px-3 py-1.5 rounded-full font-medium bg-sky-600/20 text-sky-400 hover:bg-sky-600/30 transition-colors"
                >
                  Now
                </button>
              )}
              <NsfwToggle enabled={nsfwVisible} onToggle={toggleNsfw} />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                title={isActive ? "Connected" : "Connecting…"}
                className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                  isActive ? "bg-green-500" : "bg-neutral-500 animate-pulse"
                }`}
              />
              <p className="text-xs text-neutral-500 tabular-nums">
                {cursorLabel ?? (isActive ? "Connected" : "Connecting…")}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {events.length === 0 ? (
          <p className="text-neutral-500 text-center py-16 text-sm">
            {isActive ? "Waiting for matching events…" : "Connecting to firehose…"}
          </p>
        ) : (
          events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              fading={fadingIds.has(event.id)}
              nsfwVisible={nsfwVisible}
            />
          ))
        )}
      </main>
    </div>
  );
}
