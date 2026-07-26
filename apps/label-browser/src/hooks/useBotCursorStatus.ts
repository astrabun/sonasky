import { useEffect, useRef, useState } from "react";
import { getBotCursorStatus, type BotCursorStatus } from "../utils/getBotCursorStatus";

const POLL_INTERVAL_MS = 30_000;
const PENDING_RETRY_MS = 5_000;

export function useBotCursorStatus() {
  const [status, setStatus] = useState<BotCursorStatus | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const result = await getBotCursorStatus();
      if (cancelled) return;
      setStatus(result);
      timeoutRef.current = setTimeout(
        poll,
        result.state === "pending" ? PENDING_RETRY_MS : POLL_INTERVAL_MS,
      );
    }

    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timeoutRef.current);
    };
  }, []);

  return status;
}
