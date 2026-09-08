import { fieldsForSections, reachablePath, type Answers } from "../../forms/routing.ts";
import {
  scaleTicks,
  type AnswerValue,
  type FieldDefinition,
  type FormDefinition,
} from "../../forms/types.ts";
import type { SubmitErrorCode } from "../../shared/dto.ts";

export interface ValidatedSubmission {
  visitedSectionIds: string[];
  cleanAnswers: Record<string, AnswerValue>;
}

export type ValidationResult =
  | { ok: true; value: ValidatedSubmission }
  | { ok: false; code: Extract<SubmitErrorCode, "validation-failed">; detail: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(detail: string): ValidationResult {
  return { ok: false, code: "validation-failed", detail };
}

/** Normalise an untrusted answer into a string or string[] (or undefined). */
function normalise(raw: unknown): AnswerValue | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) {
    const arr = raw.filter((v) => typeof v === "string") as string[];
    return arr;
  }
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  return undefined;
}

function isBlank(value: AnswerValue | undefined): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return value.trim() === "";
}

function coerceField(field: FieldDefinition, value: AnswerValue): AnswerValue | { error: string } {
  switch (field.type) {
    case "text":
    case "longtext":
    case "email": {
      if (Array.isArray(value)) return { error: `${field.id}: expected a single value` };
      if (field.maxLength != null && value.length > field.maxLength) {
        return { error: `${field.id}: exceeds ${field.maxLength} characters` };
      }
      if (field.type === "email" && !EMAIL_RE.test(value)) {
        return { error: `${field.id}: not a valid email` };
      }
      return value;
    }
    case "number": {
      if (Array.isArray(value)) return { error: `${field.id}: expected a single value` };
      const n = Number(value);
      if (!Number.isFinite(n)) return { error: `${field.id}: not a number` };
      if (field.min != null && n < field.min) return { error: `${field.id}: below ${field.min}` };
      if (field.max != null && n > field.max) return { error: `${field.id}: above ${field.max}` };
      return String(n);
    }
    case "linear-scale": {
      if (Array.isArray(value)) return { error: `${field.id}: expected a single value` };
      const n = Number(value);
      if (!Number.isFinite(n)) return { error: `${field.id}: not a number` };
      if (!scaleTicks(field).some((t) => Math.abs(t - n) < 1e-9)) {
        return { error: `${field.id}: "${value}" is not on the scale` };
      }
      return String(n);
    }
    case "single-select": {
      if (Array.isArray(value)) return { error: `${field.id}: expected a single value` };
      if (!field.options.some((o) => o.value === value)) {
        return { error: `${field.id}: "${value}" is not an option` };
      }
      return value;
    }
    case "multi-select": {
      const arr = Array.isArray(value) ? value : [value];
      const allowed = new Set(field.options.map((o) => o.value));
      for (const v of arr) {
        if (!allowed.has(v)) return { error: `${field.id}: "${v}" is not an option` };
      }
      return arr;
    }
  }
}

/** Identity used to fill `prefill` fields authoritatively on the server. */
export interface SubmitterIdentity {
  did: string;
  handle?: string;
}

/**
 * Recompute the authoritative visited path from the submitted answers and
 * validate every field on it. Never trusts the client's idea of which sections
 * were shown, nor its value for any `prefill` field.
 */
export function validateSubmission(
  form: FormDefinition,
  rawAnswers: Record<string, unknown>,
  identity?: SubmitterIdentity,
): ValidationResult {
  const answers: Answers = {};
  for (const [k, v] of Object.entries(rawAnswers)) {
    const n = normalise(v);
    if (n !== undefined) answers[k] = n;
  }

  let path: string[];
  try {
    path = reachablePath(form, answers);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "unresolvable section path");
  }

  const pathFields = fieldsForSections(form, path);
  const pathFieldIds = new Set(pathFields.map((f) => f.id));

  // Server-authoritative prefill: override whatever the client sent for these.
  for (const field of pathFields) {
    if (field.prefill === "did") {
      answers[field.id] = identity?.did ?? "";
    } else if (field.prefill === "handle" && identity?.handle) {
      answers[field.id] = identity.handle;
    }
  }

  for (const key of Object.keys(answers)) {
    if (!pathFieldIds.has(key)) {
      return fail(`answer for "${key}" belongs to an unreachable section`);
    }
  }

  const cleanAnswers: Record<string, AnswerValue> = {};
  for (const field of pathFields) {
    const value = answers[field.id];
    if (isBlank(value)) {
      if (field.required) return fail(`${field.id}: required`);
      continue;
    }
    const coerced = coerceField(field, value as AnswerValue);
    if (typeof coerced === "object" && !Array.isArray(coerced) && "error" in coerced) {
      return fail(coerced.error);
    }
    cleanAnswers[field.id] = coerced as AnswerValue;
  }

  return { ok: true, value: { visitedSectionIds: path, cleanAnswers } };
}
