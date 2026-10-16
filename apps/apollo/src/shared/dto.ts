/** Request/response shapes shared by the Worker API and the SPA. */

import type { ReportDestination } from "./moderation.ts";
import type {
  LayoutRecord,
  MediaRecord,
  PageRecord,
  PostRecord,
  ScriptRecord,
  SiteRecord,
  StyleRecord,
} from "./records.ts";

export type MeResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      did: string;
      handle?: string;
      /** The session is missing scopes Apollo needs to edit - sign in again. */
      reauthRequired: boolean;
      /** Viewer URL of the user's site (whether or not it exists yet). */
      siteUrl: string;
    };

export interface Entry<T> {
  rkey: string;
  cid: string;
  value: T;
}

export interface MediaEntry extends Entry<MediaRecord> {
  /** Public URL on the usercontent origin. */
  url: string;
}

export interface SiteBundle {
  did: string;
  handle?: string;
  siteUrl: string;
  usercontentOrigin: string;
  site: Entry<SiteRecord> | null;
  pages: Entry<PageRecord>[];
  posts: Entry<PostRecord>[];
  styles: Entry<StyleRecord>[];
  scripts: Entry<ScriptRecord>[];
  layouts: Entry<LayoutRecord>[];
  media: MediaEntry[];
}

export interface ApiError {
  ok: false;
  error:
    | "unauthenticated"
    | "reauth_required"
    | "blocked"
    | "rate_limited"
    | "invalid"
    | "bad_origin"
    | "not_found"
    | "limit"
    | "internal";
  message?: string;
  /** Dotted path of the offending field, for `invalid`. */
  field?: string;
}

export interface PutResponse {
  ok: true;
  uri: string;
  cid: string;
}

export interface MediaUploadResponse {
  ok: true;
  media: MediaEntry;
}

export interface PreviewRequest {
  site: SiteRecord;
  target:
    | { kind: "page"; slug: string; record: PageRecord }
    | { kind: "post"; slug: string; record: PostRecord };
  /** Theme style (draft) and any page styles. */
  styles: StyleRecord[];
  layout?: LayoutRecord;
}

export interface PreviewResponse {
  ok: true;
  html: string;
}

export type ReportSubject = { uri: string; cid: string } | { did: string };

export interface ReportRequest {
  subject: ReportSubject;
  reasonType: string;
  reason?: string;
  destination: ReportDestination;
}
