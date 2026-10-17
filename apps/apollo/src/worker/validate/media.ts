/**
 * Media type detection from file contents (magic bytes) - never trust the
 * filename, the browser-supplied type, or the PDS's stored mimeType. Only the
 * formats below are accepted on upload or served back out; SVG (can carry
 * script), HTML, archives and executables are all rejected.
 */

import { LIMITS } from "../../shared/limits.ts";

export const ALLOWED_MEDIA = {
  "image/png": LIMITS.imageBytes,
  "image/jpeg": LIMITS.imageBytes,
  "image/gif": LIMITS.imageBytes,
  "image/webp": LIMITS.imageBytes,
  "image/avif": LIMITS.imageBytes,
  "video/mp4": LIMITS.videoBytes,
  "video/webm": LIMITS.videoBytes,
} as const;

export type AllowedMime = keyof typeof ALLOWED_MEDIA;

/** How many leading bytes `sniffMime` needs. */
export const SNIFF_BYTES = 64;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  return sig.every((b, i) => bytes[offset + i] === b);
}

const MP4_BRANDS = new Set([
  "isom",
  "iso2",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
  "dash",
  "msnv",
]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

export function sniffMime(bytes: Uint8Array): AllowedMime | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  const head6 = ascii(bytes, 0, 6);
  if (head6 === "GIF87a" || head6 === "GIF89a") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (AVIF_BRANDS.has(brand)) return "image/avif";
    if (MP4_BRANDS.has(brand)) return "video/mp4";
    return null;
  }
  if (
    startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) &&
    ascii(bytes, 0, SNIFF_BYTES).includes("webm")
  ) {
    return "video/webm";
  }
  return null;
}

/**
 * Read the first `n` bytes of a stream and hand back those bytes plus a stream
 * that still yields the whole body (peeked bytes included).
 */
export async function peekStream(
  body: ReadableStream<Uint8Array>,
  n: number,
): Promise<{ head: Uint8Array; stream: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < n) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const head = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    head.set(c, offset);
    offset += c.byteLength;
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (head.byteLength) controller.enqueue(head);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { head: head.subarray(0, Math.min(n, head.byteLength)), stream };
}
