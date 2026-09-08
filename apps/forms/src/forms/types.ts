/**
 * Typed, in-repo form/survey definitions.
 *
 * This module is pure (no node:/DOM/KV imports) so it can be compiled into both
 * the client SPA and the Worker. Full `FormDefinition` objects are server-only
 * (they carry destination + env-var config); the client only ever receives the
 * sanitised DTOs in `src/shared/dto.ts`. (DTO = data transfer object)
 */

// Fields
export type FieldType =
  | "text"
  | "longtext"
  | "email"
  | "number"
  | "single-select"
  | "multi-select"
  | "linear-scale";

export interface BaseField {
  /** Stable id. The answer key AND the Google-Form per-question mapping key. */
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  required?: boolean;
  /**
   * Auto-populate from the signed-in user. The input renders read-only in the
   * client and the value is (re)set authoritatively server-side on submit, so a
   * tampered client value is ignored. Only meaningful for text fields. Do not
   * route a section on a prefilled field.
   */
  prefill?: "did" | "handle";
}

export interface TextField extends BaseField {
  type: "text" | "longtext" | "email";
  maxLength?: number;
  placeholder?: string;
}

export interface NumberField extends BaseField {
  type: "number";
  min?: number;
  max?: number;
}

export interface ChoiceOption {
  value: string;
  label: string;
}

export interface SelectField extends BaseField {
  type: "single-select" | "multi-select";
  options: ChoiceOption[];
}

/**
 * Google-Forms-style linear scale: a horizontal row of radio buttons from `min`
 * to `max` (step apart), with optional captions under each end. The answer value
 * is the chosen integer as a string.
 */
export interface ScaleField extends BaseField {
  type: "linear-scale";
  /** Lowest selectable value (typically 0 or 1). */
  min: number;
  /** Highest selectable value (Google Forms allows up to 10). */
  max: number;
  /** Gap between ticks. Default 1. */
  step?: number;
  /** Caption under the low end, e.g. "worst". */
  minLabel?: string;
  /** Caption under the high end, e.g. "best". */
  maxLabel?: string;
}

export type FieldDefinition = TextField | NumberField | SelectField | ScaleField;

/** The ordered tick values of a linear-scale field. */
export function scaleTicks(field: ScaleField): number[] {
  const step = field.step && field.step > 0 ? field.step : 1;
  const ticks: number[] = [];
  for (let v = field.min; v <= field.max + 1e-9; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

/** An answer value: a string for text/number/single-select, string[] for multi-select. */
export type AnswerValue = string | string[];

// Sections + conditional routing
/**
 * A routing target is a section id, or one of these two sentinels. They are
 * plain strings (not section ids any form would use) so routing tables stay
 * simple to write and serialise.
 */
export type RoutingTarget = string;

/** Routing target: end the form. */
export const SUBMIT: RoutingTarget = "__submit__";
/** Routing target: fall through to the next section in document order. */
export const NEXT: RoutingTarget = "__next__";

/**
 * Branch off a designated field's answer. `cases` maps an exact answer value to
 * a target section id (or SUBMIT). `default` applies when no case matches
 * (NEXT = next section in document order, SUBMIT = end).
 *
 * For a multi-select routing field, a case matches when its key is one of the
 * selected values (first case in object order wins).
 */
export interface SectionRouting {
  fieldId: string;
  cases: Record<string, RoutingTarget>;
  default: RoutingTarget;
}

export interface SectionDefinition {
  id: string;
  title?: string;
  description?: string;
  fields: FieldDefinition[];
  /** Omitted => unconditional NEXT (or SUBMIT when this is the last section). */
  routing?: SectionRouting;
}

// Destinations
export type GoogleFormMapping =
  /** fieldId -> "entry.123456789" */
  | { perQuestion: Record<string, string> }
  /** one "entry.<id>" receives a JSON blob of all answers on the visited path */
  | { singleField: string };

export interface GoogleFormDestination {
  kind: "google-form";
  /** Name of the Env var holding the Google Form id (the `/d/e/<ID>/` segment). */
  formIdEnvVar: string;
  mapping: GoogleFormMapping;
  /**
   * Optional: also send the `at://` uri of the submission-marker record written
   * to the user's repo, into this `entry.<id>`. Gives the Google Form response an
   * audit-trail pointer back to the on-repo acknowledgement. Omit to skip.
   */
  submissionUriEntryId?: string;
}

export interface AtprotoRecordDestination {
  kind: "atproto-record";
  /** Collection for the full response record. */
  collection: string;
  /** Optionally also POST the resulting at:// uri into a Google Form (e.g. a sheet index). */
  alsoIndexToGoogleForm?: { formIdEnvVar: string; uriEntryId: string };
}

export type Destination = GoogleFormDestination | AtprotoRecordDestination;

// Form
export interface FormDefinition {
  /** Slug. Stable. Stored verbatim as `formId` in marker + response records. */
  id: string;
  title: string;
  description?: string;
  /** Inactive forms 404 and are omitted from the list. */
  active: boolean;
  /** When true, a user with an existing submission marker for this id is rejected. */
  singleResponsePerUser: boolean;
  /** Ordered. sections[0] is the entry section. */
  sections: SectionDefinition[];
  /** One or both. Evaluated in array order at submit time. */
  destinations: Destination[];
}

// Helpers
export function isSelectField(f: FieldDefinition): f is SelectField {
  return f.type === "single-select" || f.type === "multi-select";
}

export function isNumberField(f: FieldDefinition): f is NumberField {
  return f.type === "number";
}

export function isTextField(f: FieldDefinition): f is TextField {
  return f.type === "text" || f.type === "longtext" || f.type === "email";
}

export function isScaleField(f: FieldDefinition): f is ScaleField {
  return f.type === "linear-scale";
}
