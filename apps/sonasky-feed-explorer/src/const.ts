export const BSKY_API = "https://public.api.bsky.app/xrpc";

export const FEED_GENERATOR_API: string =
  (import.meta.env.VITE_FEED_GENERATOR_URL as string | undefined) ?? "http://localhost:8080";
