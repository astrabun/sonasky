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
  singleResponsePerUser: boolean;
  /** Only meaningful for `singleResponsePerUser` forms when the caller is authed. */
  alreadySubmitted: boolean;
}

export interface FormDetailDTO extends FormSummary {
  /** Sections including `routing` - the client needs the branch graph. */
  sections: SectionDefinition[];
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
