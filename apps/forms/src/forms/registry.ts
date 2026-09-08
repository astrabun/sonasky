import { assertFormValid } from "./routing.ts";
import type { FormDefinition } from "./types.ts";
import { feedbackSurvey202609 } from "./definitions/sonasky-feedback-2026-09.ts";

const ALL: readonly FormDefinition[] = [feedbackSurvey202609];

// Fail fast at module load if any form's section graph is malformed.
for (const form of ALL) assertFormValid(form);

const BY_ID = new Map(ALL.map((f) => [f.id, f]));

if (BY_ID.size !== ALL.length) {
  throw new Error("duplicate form id in registry");
}

/** All forms, regardless of `active`. */
export function allForms(): readonly FormDefinition[] {
  return ALL;
}

/** Active forms only. */
export function listActiveForms(): FormDefinition[] {
  return ALL.filter((f) => f.active);
}

/** Look up by id. Caller checks `.active` separately. */
export function getForm(id: string): FormDefinition | undefined {
  return BY_ID.get(id);
}
