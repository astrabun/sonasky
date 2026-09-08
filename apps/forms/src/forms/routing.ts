/**
 * Pure section-graph helpers. Imported by BOTH the client SPA (to drive the
 * section-at-a-time runner) and the Worker (to recompute the authoritative
 * visited path from submitted answers). Keep this file free of node:/DOM/KV.
 */

import {
  NEXT,
  SUBMIT,
  type AnswerValue,
  type FieldDefinition,
  type FormDefinition,
  type SectionDefinition,
} from "./types.ts";

export type Answers = Record<string, AnswerValue | undefined>;

/** The minimal shape the section-graph logic needs. `FormDefinition` and the
 * client's `FormDetailDTO` both satisfy it. */
export type FormGraph = Pick<FormDefinition, "id" | "sections">;

export function entrySectionId(form: FormGraph): string {
  const first = form.sections[0];
  if (!first) throw new Error(`form "${form.id}" has no sections`);
  return first.id;
}

function sectionById(form: FormGraph, id: string): SectionDefinition | undefined {
  return form.sections.find((s) => s.id === id);
}

function sectionIndex(form: FormGraph, id: string): number {
  return form.sections.findIndex((s) => s.id === id);
}

function answerMatchesCase(answer: AnswerValue | undefined, caseKey: string): boolean {
  if (Array.isArray(answer)) return answer.includes(caseKey);
  return answer === caseKey;
}

/**
 * Resolve the section that follows `currentSectionId` given `answers`.
 * Returns a section id or SUBMIT.
 */
export function nextSectionId(form: FormGraph, currentSectionId: string, answers: Answers): string {
  const section = sectionById(form, currentSectionId);
  if (!section) throw new Error(`unknown section "${currentSectionId}" in form "${form.id}"`);

  const routing = section.routing;
  if (routing) {
    const answer = answers[routing.fieldId];
    for (const [caseKey, target] of Object.entries(routing.cases)) {
      if (answerMatchesCase(answer, caseKey)) {
        return target;
      }
    }
    if (routing.default !== NEXT) return routing.default;
  }

  // NEXT (explicit or implicit): the next section in document order, else SUBMIT.
  const idx = sectionIndex(form, currentSectionId);
  const next = form.sections[idx + 1];
  return next ? next.id : SUBMIT;
}

/**
 * Walk the graph from the entry section using `answers`, returning the ordered
 * list of section ids actually visited. Throws on cycles or unknown targets
 * (those are also caught up front by `assertFormValid`).
 */
export function reachablePath(form: FormGraph, answers: Answers): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let cursor: string = entrySectionId(form);

  while (cursor !== SUBMIT) {
    if (seen.has(cursor)) {
      throw new Error(`routing cycle in form "${form.id}" at section "${cursor}"`);
    }
    if (!sectionById(form, cursor)) {
      throw new Error(`routing target "${cursor}" not found in form "${form.id}"`);
    }
    seen.add(cursor);
    path.push(cursor);
    cursor = nextSectionId(form, cursor, answers);
  }

  return path;
}

/** All fields belonging to the sections in `sectionIds`, in order. */
export function fieldsForSections(
  form: FormGraph,
  sectionIds: readonly string[],
): FieldDefinition[] {
  const out: FieldDefinition[] = [];
  for (const id of sectionIds) {
    const section = sectionById(form, id);
    if (section) out.push(...section.fields);
  }
  return out;
}

/**
 * Registry-load sanity check. Throws on: empty form, duplicate section ids,
 * duplicate field ids, routing that references an unknown field or section, or
 * a graph that cannot terminate.
 */
export function assertFormValid(form: FormGraph): void {
  if (form.sections.length === 0) {
    throw new Error(`form "${form.id}" has no sections`);
  }

  const sectionIds = new Set<string>();
  const fieldIds = new Set<string>();
  for (const section of form.sections) {
    if (section.id === SUBMIT || section.id === NEXT) {
      throw new Error(
        `form "${form.id}" section id "${section.id}" collides with a routing sentinel`,
      );
    }
    if (sectionIds.has(section.id)) {
      throw new Error(`form "${form.id}" has duplicate section id "${section.id}"`);
    }
    sectionIds.add(section.id);
    for (const field of section.fields) {
      if (fieldIds.has(field.id)) {
        throw new Error(`form "${form.id}" has duplicate field id "${field.id}"`);
      }
      fieldIds.add(field.id);
    }
  }

  for (const section of form.sections) {
    const routing = section.routing;
    if (!routing) continue;
    if (!fieldIds.has(routing.fieldId)) {
      throw new Error(
        `form "${form.id}" section "${section.id}" routes on unknown field "${routing.fieldId}"`,
      );
    }
    const targets = [...Object.values(routing.cases), routing.default];
    for (const target of targets) {
      if (target === SUBMIT || target === NEXT) continue;
      if (!sectionIds.has(target)) {
        throw new Error(
          `form "${form.id}" section "${section.id}" routes to unknown section "${target}"`,
        );
      }
    }
  }

  // Every section must be able to terminate. Walk forward from each section
  // following only `default`/NEXT and the declared cases; a section whose every
  // outgoing edge loops without reaching SUBMIT / the document end is invalid.
  for (const start of form.sections) {
    if (!canTerminate(form, start.id, new Set())) {
      throw new Error(`form "${form.id}" section "${start.id}" cannot reach submit`);
    }
  }
}

function canTerminate(form: FormGraph, sectionId: string, stack: Set<string>): boolean {
  if (stack.has(sectionId)) return false;
  stack.add(sectionId);

  const section = form.sections.find((s) => s.id === sectionId);
  if (!section) return false;

  const idx = form.sections.findIndex((s) => s.id === sectionId);
  const documentNext = form.sections[idx + 1];
  const edges: string[] = [];

  if (section.routing) {
    for (const target of Object.values(section.routing.cases)) edges.push(target);
    if (section.routing.default === NEXT) {
      edges.push(documentNext ? documentNext.id : SUBMIT);
    } else {
      edges.push(section.routing.default);
    }
  } else {
    edges.push(documentNext ? documentNext.id : SUBMIT);
  }

  for (const edge of edges) {
    if (edge === SUBMIT) {
      stack.delete(sectionId);
      return true;
    }
    if (canTerminate(form, edge, stack)) {
      stack.delete(sectionId);
      return true;
    }
  }

  stack.delete(sectionId);
  return false;
}
