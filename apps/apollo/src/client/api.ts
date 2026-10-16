import type {
  ApiError,
  MediaUploadResponse,
  MeResponse,
  PreviewRequest,
  PreviewResponse,
  PutResponse,
  ReportRequest,
  SiteBundle,
} from "../shared/dto.ts";
import type { SlugCollection } from "../shared/nsid.ts";
import type { SiteRecord } from "../shared/records.ts";

/** A failed API call, carrying the server's user-facing message when there is one. */
export class ApiFailure extends Error {
  readonly code: ApiError["error"];
  readonly field?: string;
  constructor(body: ApiError) {
    super(body.message ?? defaultMessage(body.error));
    this.code = body.error;
    this.field = body.field;
  }
}

function defaultMessage(code: ApiError["error"]): string {
  switch (code) {
    case "unauthenticated":
      return "You've been signed out. Sign in again to keep editing.";
    case "reauth_required":
      return "Apollo needs you to sign in again to keep editing.";
    case "rate_limited":
      return "Slow down a little and try again in a minute.";
    case "blocked":
      return "This account can't publish on Apollo.";
    default:
      return "Something went wrong. Please try again.";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiFailure({
      ok: false,
      error: "internal",
      message: "Couldn't reach Apollo. Check your connection.",
    });
  }
  const body = (await res.json().catch(() => null)) as (T & { ok?: boolean }) | ApiError | null;
  if (!res.ok || (body && "ok" in body && body.ok === false)) {
    throw new ApiFailure((body as ApiError | null) ?? { ok: false, error: "internal" });
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  me: () => call<MeResponse>("/api/me"),
  site: () => call<SiteBundle>("/api/site"),
  putSite: (record: Omit<SiteRecord, "$type" | "updatedAt"> & { updatedAt?: string }) =>
    call<PutResponse>("/api/site", json("PUT", record)),
  deleteSite: () => call<{ ok: true }>("/api/site", { method: "DELETE" }),
  putRecord: (collection: SlugCollection, rkey: string, record: unknown) =>
    call<PutResponse>(
      `/api/records/${collection}/${encodeURIComponent(rkey)}`,
      json("PUT", record),
    ),
  deleteRecord: (collection: string, rkey: string) =>
    call<{ ok: true }>(`/api/records/${collection}/${encodeURIComponent(rkey)}`, {
      method: "DELETE",
    }),
  /** `alt: null` means the uploader explicitly chose not to add a description. */
  uploadMedia: (file: File, alt: string | null, size?: { width: number; height: number }) => {
    const form = new FormData();
    form.set("file", file);
    if (alt === null) form.set("noAlt", "true");
    else form.set("alt", alt);
    if (size) {
      form.set("width", String(size.width));
      form.set("height", String(size.height));
    }
    return call<MediaUploadResponse>("/api/media", { method: "POST", body: form });
  },
  updateMediaAlt: (rkey: string, alt: string) =>
    call<PutResponse>(`/api/media/${encodeURIComponent(rkey)}`, json("PUT", { alt })),
  preview: (req: PreviewRequest) => call<PreviewResponse>("/api/preview", json("POST", req)),
  report: (req: ReportRequest) => call<{ ok: true }>("/api/report", json("POST", req)),
};

export function loginHref(handle: string, returnTo?: string, purpose?: "report"): string {
  const params = new URLSearchParams({ handle: handle.trim() });
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    params.set("return", returnTo);
  }
  if (purpose) params.set("purpose", purpose);
  return `/oauth/login?${params.toString()}`;
}

export function logout(): Promise<unknown> {
  return fetch("/oauth/logout", { method: "POST" });
}
