/**
 * Hard caps on what Apollo will write to a PDS. atproto recommends records stay
 * at "a few dozen KB" (1 MiB is the practical ceiling), so every text field has
 * a byte cap and the whole record has one too. String caps are UTF-8 bytes,
 * matching Lexicon `maxLength` semantics. The editor shows the same numbers as
 * a live meter; the Worker enforces them before every write.
 */
export const LIMITS = {
  /** Whole record, JSON-encoded. */
  recordJsonBytes: 100_000,
  pageBodyBytes: 64 * 1024,
  styleCssBytes: 32 * 1024,
  scriptJsBytes: 32 * 1024,
  layoutHtmlBytes: 32 * 1024,
  textBlockBytes: 8 * 1024,

  blocksPerPage: 128,
  pagesPerSite: 64,
  postsPerSite: 500,
  stylesPerSite: 16,
  scriptsPerSite: 16,
  layoutsPerSite: 8,
  stylesPerPage: 8,
  scriptsPerPage: 8,
  navItems: 32,
  buttonsPerBlock: 32,
  galleryItems: 24,
  labelersPerBlock: 10,
  tagsPerPost: 16,
  ringsPerAccount: 16,
  ringMembers: 100,
  /** Rings one site can belong to (each adds a footer nav). */
  ringsPerSite: 8,

  titleBytes: 300,
  descriptionBytes: 3000,
  labelBytes: 200,
  altBytes: 2000,
  urlBytes: 2048,
  nameBytes: 200,

  imageBytes: 5_000_000,
  videoBytes: 50_000_000,
} as const;

const encoder = new TextEncoder();

export function utf8Bytes(value: string): number {
  return encoder.encode(value).byteLength;
}

export function jsonBytes(value: unknown): number {
  return utf8Bytes(JSON.stringify(value));
}

/** "12.3 KB" style formatting for size meters and error messages. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
