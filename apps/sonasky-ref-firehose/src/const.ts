export const MAX_EVENTS = 100;

/** How long an event stays visible before starting to fade out (ms). */
export const EVENT_LIFETIME_MS = 60_000;

/** Duration of the fade-out transition (ms). */
export const EVENT_FADE_MS = 1000;

/** Gap between last event and now below which the stream is considered live (µs). */
export const LIVE_THRESHOLD_US = 60 * 1000 * 1000;

export const REWIND_OPTIONS: { durationMs: number; label: string }[] = [
  { durationMs: 1 * 60 * 60 * 1000, label: "1h" },
  { durationMs: 4 * 60 * 60 * 1000, label: "4h" },
  { durationMs: 8 * 60 * 60 * 1000, label: "8h" },
  { durationMs: 12 * 60 * 60 * 1000, label: "12h" },
  { durationMs: 24 * 60 * 60 * 1000, label: "24h" },
];
