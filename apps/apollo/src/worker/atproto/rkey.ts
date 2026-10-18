const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/**
 * A record key derived from a uri: 26 base32 chars of sha256(uri). Used where
 * an account has at most one record per target (ring memberships, likes), so
 * checking for it is one getRecord.
 */
export async function hashRkey(uri: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(uri)),
  );
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 26) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}
