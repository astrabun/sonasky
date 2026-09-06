import type { ServerResponse } from "node:http";

export const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

/** XRPC-style error payload. */
export const sendError = (
  res: ServerResponse,
  status: number,
  error: string,
  message?: string,
): void => sendJson(res, status, message ? { error, message } : { error });
