/**
 * Stateless signed session cookie. Value is `base64url(did).base64url(HMAC)`,
 * where HMAC is HMAC-SHA256 over the did using COOKIE_SECRET. The DID is not
 * secret; the signature only prevents a client forging someone else's session.
 */

const COOKIE_NAME = "sonasky_forms_sid";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of view) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function serializeSessionCookie(
  secret: string,
  did: string,
  secure = true,
): Promise<string> {
  const sig = await hmac(secret, did);
  const value = `${b64urlEncode(new TextEncoder().encode(did))}.${b64urlEncode(sig)}`;
  return [
    `${COOKIE_NAME}=${value}`,
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ].join("; ");
}

export function clearSessionCookie(secure = true): string {
  return [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ].join("; ");
}

export async function readSessionCookie(
  secret: string,
  cookieHeader: string | null | undefined,
): Promise<string | null> {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(/; */)
    .map((c) => c.split("="))
    .find(([name]) => name === COOKIE_NAME);
  if (!match) return null;

  const [, value] = match;
  const dot = value.indexOf(".");
  if (dot < 0) return null;

  const did = new TextDecoder().decode(b64urlDecode(value.slice(0, dot)));
  const providedSig = b64urlDecode(value.slice(dot + 1));
  const expectedSig = new Uint8Array(await hmac(secret, did));

  return timingSafeEqual(providedSig, expectedSig) ? did : null;
}
