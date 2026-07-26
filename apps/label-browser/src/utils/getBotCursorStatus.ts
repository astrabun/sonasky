const CURSOR_STATUS_URL = "https://api-bot-cursor-pos.sonasky.app/";

interface BotCursorStatusResponse {
  cursor: number | null;
  cursorAt: string | null;
  now: string;
  lagMs: number | null;
}

type BotCursorStatus =
  | { state: "ok"; cursor: number; cursorAt: string; now: string; lagMs: number }
  | { state: "pending"; now: string }
  | { state: "offline" };

async function getBotCursorStatus(): Promise<BotCursorStatus> {
  try {
    const res = await fetch(CURSOR_STATUS_URL);
    if (!res.ok) return { state: "offline" };

    const data: BotCursorStatusResponse = await res.json();
    if (data.cursor === null || data.cursorAt === null || data.lagMs === null) {
      return { state: "pending", now: data.now };
    }

    return {
      state: "ok",
      cursor: data.cursor,
      cursorAt: data.cursorAt,
      now: data.now,
      lagMs: data.lagMs,
    };
  } catch {
    return { state: "offline" };
  }
}

export { getBotCursorStatus };
export type { BotCursorStatus };
