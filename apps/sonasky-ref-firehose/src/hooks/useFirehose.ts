import { JetstreamSubscription } from "@atcute/jetstream";
import { useCallback, useEffect, useRef, useState } from "react";
import { EVENT_FADE_MS, EVENT_LIFETIME_MS, LIVE_THRESHOLD_US, MAX_EVENTS } from "../const";
import type { Character, FirehoseEvent } from "../types";

const JETSTREAM_URL = "wss://jetstream2.us-east.bsky.network/subscribe";

interface SubscriptionConfig {
  cursor?: number;
  key: number;
}

export function useFirehose(): {
  connected: boolean;
  events: FirehoseEvent[];
  fadingIds: Set<string>;
  isRewinding: boolean;
  jumpToNow: () => void;
  lastEventTimeUs: number;
  rewind: (durationMs: number) => void;
} {
  const [subscriptionConfig, setSubscriptionConfig] = useState<SubscriptionConfig>({ key: 0 });
  const [events, setEvents] = useState<FirehoseEvent[]>([]);
  const [fadingIds, setFadingIds] = useState<Set<string>>(() => new Set());
  const [lastEventTimeUs, setLastEventTimeUs] = useState(0);
  const [connected, setConnected] = useState(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());

  const rewind = useCallback((durationMs: number) => {
    setSubscriptionConfig((prev) => ({
      cursor: (Date.now() - durationMs) * 1000,
      key: prev.key + 1,
    }));
  }, []);

  const jumpToNow = useCallback(() => {
    setSubscriptionConfig((prev) => ({
      cursor: undefined,
      key: prev.key + 1,
    }));
  }, []);

  useEffect(() => {
    setEvents([]);
    setFadingIds(new Set());
    setLastEventTimeUs(0);
    for (const timers of timersRef.current.values()) {
      timers.forEach(clearTimeout);
    }
    timersRef.current.clear();

    let cancelled = false;

    const sub = new JetstreamSubscription({
      cursor: subscriptionConfig.cursor,
      onConnectionClose: () => setConnected(false),
      onConnectionError: () => setConnected(false),
      onConnectionOpen: () => setConnected(true),
      url: JETSTREAM_URL,
      wantedCollections: ["app.sonasky.ref"],
    });

    void (async () => {
      for await (const event of sub) {
        if (cancelled) {
          break;
        }
        setLastEventTimeUs(event.time_us);

        if (event.kind === "commit") {
          const { commit } = event;
          const base = {
            did: event.did,
            id: `${event.did}-${commit.rkey}-${event.time_us}`,
            rkey: commit.rkey,
            timeUs: event.time_us,
          };

          let firehoseEvent: FirehoseEvent;
          if (commit.operation === "delete") {
            firehoseEvent = { ...base, operation: "delete" };
          } else {
            const raw = commit.record as unknown as { character?: Character };
            firehoseEvent = {
              ...base,
              character: raw.character,
              operation: commit.operation,
            };
          }

          setEvents((prev) => [firehoseEvent, ...prev].slice(0, MAX_EVENTS));

          const { id } = firehoseEvent;
          const t1 = setTimeout(() => {
            setFadingIds((prev) => new Set([...prev, id]));
          }, EVENT_LIFETIME_MS);
          const t2 = setTimeout(() => {
            setFadingIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
            setEvents((prev) => prev.filter((e) => e.id !== id));
            timersRef.current.delete(id);
          }, EVENT_LIFETIME_MS + EVENT_FADE_MS);

          timersRef.current.set(id, [t1, t2]);
        }
      }
    })();

    return () => {
      cancelled = true;
      for (const timers of timersRef.current.values()) {
        timers.forEach(clearTimeout);
      }
      timersRef.current.clear();
    };
  }, [subscriptionConfig]);

  const isNearLive = lastEventTimeUs > 0 && Date.now() * 1000 - lastEventTimeUs < LIVE_THRESHOLD_US;

  return {
    connected,
    events,
    fadingIds,
    isRewinding: subscriptionConfig.cursor !== undefined && !isNearLive,
    jumpToNow,
    lastEventTimeUs,
    rewind,
  };
}
