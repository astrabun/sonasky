import type {
  ApiError,
  DiscoverResponse,
  LikeStatusResponse,
  MediaUploadResponse,
  MeResponse,
  PreviewRequest,
  PreviewResponse,
  PutResponse,
  ReportRequest,
  RingLookupResponse,
  RingDirectoryResponse,
  RingsResponse,
  SiteBundle,
  SiteDirectoryResponse,
  SiteLookupResponse,
  StatsResponse,
} from "../shared/dto.ts";
import type { SlugCollection } from "../shared/nsid.ts";
import type { RingRecord, SiteRecord } from "../shared/records.ts";

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
  stats: () => call<StatsResponse>("/api/stats"),
  discover: (not?: string) =>
    call<DiscoverResponse>(`/api/discover${not ? `?not=${encodeURIComponent(not)}` : ""}`),
  discoverRings: () => call<RingDirectoryResponse>("/api/discover/rings"),
  discoverSites: (sort: string, page: number) =>
    call<SiteDirectoryResponse>(
      `/api/discover/sites?${new URLSearchParams({ sort, page: String(page) }).toString()}`,
    ),
  lookupSite: (actor: string) =>
    call<SiteLookupResponse>(`/api/discover/lookup?actor=${encodeURIComponent(actor)}`),
  likeStatus: (site: string) =>
    call<LikeStatusResponse>(`/api/likes?site=${encodeURIComponent(site)}`),
  like: (site: string) => call<PutResponse>("/api/likes", json("POST", { site })),
  unlike: (site: string) =>
    call<{ ok: true }>(`/api/likes?site=${encodeURIComponent(site)}`, { method: "DELETE" }),
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
  rings: () => call<RingsResponse>("/api/rings"),
  putRing: (
    slug: string,
    record: Omit<RingRecord, "$type" | "updatedAt" | "createdAt"> & {
      createdAt?: string;
    },
  ) => call<PutResponse>(`/api/rings/${encodeURIComponent(slug)}`, json("PUT", record)),
  deleteRing: (slug: string) =>
    call<{ ok: true }>(`/api/rings/${encodeURIComponent(slug)}`, { method: "DELETE" }),
  lookupRing: (uri: string) =>
    call<RingLookupResponse>(`/api/rings/lookup?ring=${encodeURIComponent(uri)}`),
  joinRing: (uri: string) =>
    call<PutResponse>("/api/ring-memberships", json("POST", { ring: uri })),
  leaveRing: (uri: string) =>
    call<{ ok: true }>(`/api/ring-memberships?ring=${encodeURIComponent(uri)}`, {
      method: "DELETE",
    }),
  report: (req: ReportRequest) => call<{ ok: true }>("/api/report", json("POST", req)),
};

export type SignInPurpose = "report" | "like";

export function loginHref(handle: string, returnTo?: string, purpose?: SignInPurpose): string {
  const params = new URLSearchParams({ handle: handle.trim() });
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    params.set("return", returnTo);
  }
  if (purpose) params.set("purpose", purpose);
  return `/oauth/login?${params.toString()}`;
}

/** The page that asks for a like-capable sign-in, then returns to `returnTo`. */
export function likeSignInHref(returnTo: string): string {
  return `/like?${new URLSearchParams({ return: returnTo }).toString()}`;
}

export function logout(): Promise<unknown> {
  return fetch("/oauth/logout", { method: "POST" });
}
