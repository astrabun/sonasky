import { useState } from "react";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import { useBotCursorStatus } from "../hooks/useBotCursorStatus";

dayjs.extend(duration);
dayjs.extend(relativeTime);

const AUTO_EXPAND_THRESHOLD_MS = 5 * 60 * 1000;

function BotStatus() {
  const status = useBotCursorStatus();
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);

  if (!status) return null;

  const autoExpand = status.state === "ok" && status.lagMs > AUTO_EXPAND_THRESHOLD_MS;
  const expanded = manualExpanded ?? autoExpand;

  const summary =
    status.state === "ok"
      ? `Bot is ${dayjs.duration(status.lagMs).humanize()} behind`
      : status.state === "pending"
        ? "Bot status: checking..."
        : "Bot may be offline";

  return (
    <div className={`bot-status bot-status--${status.state}`}>
      <button
        type="button"
        className="bot-status-toggle"
        onClick={() => setManualExpanded(!expanded)}
      >
        {summary}
        <span className="bot-status-chevron">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="bot-status-details">
          {status.state === "ok" && (
            <>
              <p>Last seen position: {dayjs(status.cursorAt).format("YYYY-MM-DD HH:mm:ss")}</p>
              <p>Current time: {dayjs(status.now).format("YYYY-MM-DD HH:mm:ss")}</p>
              <p>Lag: {dayjs.duration(status.lagMs).humanize()}</p>
            </>
          )}
          {status.state === "pending" && (
            <p>The bot appears to have just restarted. Rechecking shortly...</p>
          )}
          {status.state === "offline" && (
            <p>Could not reach the bot status endpoint. It may be down.</p>
          )}

          <p>
            Status page (best effort):{" "}
            <a
              href="https://uptime.bnuy.zone/status/sonasky"
              target="_blank"
              rel="noreferrer noopener"
            >
              https://uptime.bnuy.zone/status/sonasky
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

export { BotStatus };
