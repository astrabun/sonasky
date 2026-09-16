/**
 * Wire types shared by the client and the Worker. The client never sees a raw
 * `FormDefinition` - form list/detail responses are mapped to these DTOs with
 * all destination/env-var config stripped out.
 */

import type { AnswerValue, SectionDefinition } from "../forms/types.ts";

export interface MeResponse {
  authenticated: boolean;
  did?: string;
  handle?: string;
}

export interface FormSummary {
  id: string;
  title: string;
  description?: string;
  /** ISO date (YYYY-MM-DD). Sorts the active list and the archive index. */
  date: string;
  /** Pinned to the top of whichever index page (active or archive) it appears on. */
  pinned?: boolean;
  singleResponsePerUser: boolean;
  /** Only meaningful for `singleResponsePerUser` forms when the caller is authed. */
  alreadySubmitted: boolean;
  /**
   * True when this form has an `atproto-record` destination, i.e. the full
   * answers get written to the user's own repo (publicly readable), not just
   * a submission marker. Surfaced to the client so it can warn the user
   * before they fill the form out.
   */
  publishesFullResponse: boolean;
}

export interface FormDetailDTO extends FormSummary {
  /** Sections including `routing` - the client needs the branch graph. */
  sections: SectionDefinition[];
}

/** Archive listing entry: closed forms only, plus their `postFormDetails` markdown. */
export interface ArchivedFormSummary extends FormSummary {
  postFormDetails?: string;
}

/**
 * Response for `GET /api/forms/:id` when the form isn't open (not found, or
 * `active: false`). Inactive forms still carry title/description/postFormDetails
 * so the client can render something better than a bare error - unless the form
 * isn't `publicArchive` and the caller isn't signed in, in which case those
 * fields are withheld and `authRequired` is set so the client can prompt a
 * sign-in instead of leaking the closed form's content.
 */
export interface FormUnavailable {
  ok: false;
  code: "form-not-found" | "form-inactive";
  title?: string;
  description?: string;
  postFormDetails?: string;
  /** True when this closed form's details are only visible to signed-in users. */
  authRequired?: boolean;
}

export interface SubmitRequest {
  answers: Record<string, AnswerValue>;
}

export type SubmitErrorCode =
  | "unauthenticated"
  | "form-not-found"
  | "form-inactive"
  | "validation-failed"
  | "already-submitted"
  | "google-form-rejected"
  | "record-write-failed"
  | "config-error";

export interface SubmitSuccess {
  ok: true;
  markerUri: string;
  recordUri?: string;
  googleFormAccepted?: boolean;
  /** Set when an external write succeeded but the marker write then failed. */
  warning?: "marker-write-failed";
}

export interface SubmitError {
  ok: false;
  code: SubmitErrorCode;
  detail?: string;
}

export type SubmitResponse = SubmitSuccess | SubmitError;
