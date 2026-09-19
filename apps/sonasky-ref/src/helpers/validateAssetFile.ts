import { ALLOWED_ASSET_MIME_TYPES, MAX_ASSET_SIZE_BYTES } from "../const";

export function validateAssetFile(file: File): { status: boolean; message: string } {
  if (!ALLOWED_ASSET_MIME_TYPES.includes(file.type)) {
    return {
      message: `Unsupported file type "${file.type || "unknown"}". Please upload a PNG, JPEG, WebP, or GIF.`,
      status: false,
    };
  }
  if (file.size > MAX_ASSET_SIZE_BYTES) {
    return {
      message: `File is too large (${(file.size / 1_000_000).toFixed(1)}MB). Maximum size is ${MAX_ASSET_SIZE_BYTES / 1_000_000}MB.`,
      status: false,
    };
  }
  return { message: "OK", status: true };
}
