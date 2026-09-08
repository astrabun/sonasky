import { useMemo, useState } from "react";
import { SUBMIT, type AnswerValue } from "../../forms/types.ts";
import type { FormDetailDTO, SubmitResponse } from "../../shared/dto.ts";
import { submitForm } from "../api.ts";
import { entrySectionId, fieldsForSections, nextSectionId, reachablePath } from "../routing.ts";
import { Section } from "./Section.tsx";
import { SubmitResult } from "./SubmitResult.tsx";

type Answers = Record<string, AnswerValue | undefined>;
type Phase = "filling" | "review" | "submitting" | "done";

const btn =
  "inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50";
const btnPrimary = `${btn} bg-sky-600 text-white hover:bg-sky-500`;
const btnGhost = `${btn} border border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800`;

function isBlank(v: AnswerValue | undefined): boolean {
  if (v == null) return true;
  return Array.isArray(v) ? v.length === 0 : v.trim() === "";
}

export interface RunnerIdentity {
  did?: string;
  handle?: string;
}

function seedAnswers(form: FormDetailDTO, identity: RunnerIdentity): Answers {
  const seed: Answers = {};
  for (const section of form.sections) {
    for (const field of section.fields) {
      if (field.prefill === "did" && identity.did) seed[field.id] = identity.did;
      else if (field.prefill === "handle" && identity.handle) seed[field.id] = identity.handle;
    }
  }
  return seed;
}

export function FormRunner({
  form,
  onExit,
  identity,
}: {
  form: FormDetailDTO;
  onExit: () => void;
  identity: RunnerIdentity;
}) {
  const [answers, setAnswers] = useState<Answers>(() => seedAnswers(form, identity));
  const [stack, setStack] = useState<string[]>([entrySectionId(form)]);
  const [phase, setPhase] = useState<Phase>("filling");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);

  const currentId = stack[stack.length - 1];
  const currentSection = useMemo(
    () => form.sections.find((s) => s.id === currentId)!,
    [form, currentId],
  );

  function setField(fieldId: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
    setError(null);
  }

  function goNext() {
    const missing = currentSection.fields.find((f) => f.required && isBlank(answers[f.id]));
    if (missing) {
      setError(`"${missing.label}" is required.`);
      return;
    }
    const target = nextSectionId(form, currentId, answers);
    if (target === SUBMIT) {
      setPhase("review");
    } else {
      setStack((s) => [...s, target]);
    }
    setError(null);
  }

  function goBack() {
    if (phase === "review") {
      setPhase("filling");
      return;
    }
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    setError(null);
  }

  async function submit() {
    const path = reachablePath(form, answers);
    const keep = new Set(fieldsForSections(form, path).map((f) => f.id));
    const pruned: Record<string, AnswerValue> = {};
    for (const [k, v] of Object.entries(answers)) {
      if (keep.has(k) && v !== undefined && !isBlank(v)) pruned[k] = v;
    }

    setPhase("submitting");
    setError(null);
    try {
      const res = await submitForm(form.id, { answers: pruned });
      setResult(res);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed.");
      setPhase("review");
    }
  }

  if (phase === "done" && result) {
    return <SubmitResult result={result} onExit={onExit} />;
  }

  const reviewPath = phase === "review" ? reachablePath(form, answers) : [];
  const reviewFields = fieldsForSections(form, reviewPath);

  return (
    <div className="space-y-6">
      <button className="text-sm text-sky-600 hover:underline" onClick={onExit} type="button">
        ← All forms
      </button>

      <div>
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">{form.title}</h1>
        {form.description ? (
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{form.description}</p>
        ) : null}
      </div>

      {phase === "review" ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Review your answers</h2>
          <dl className="divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {reviewFields.map((f) => {
              const v = answers[f.id];
              return (
                <div key={f.id} className="grid grid-cols-3 gap-3 px-3 py-2 text-sm">
                  <dt className="text-neutral-500">{f.label}</dt>
                  <dd className="col-span-2">
                    {v == null || isBlank(v) ? "-" : Array.isArray(v) ? v.join(", ") : v}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ) : (
        <Section section={currentSection} answers={answers} onChange={setField} />
      )}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="flex gap-3">
        {(stack.length > 1 || phase === "review") && (
          <button
            className={btnGhost}
            onClick={goBack}
            type="button"
            disabled={phase === "submitting"}
          >
            Back
          </button>
        )}
        {phase === "review" ? (
          <button
            className={btnPrimary}
            onClick={submit}
            type="button"
            disabled={phase !== "review"}
          >
            Submit
          </button>
        ) : phase === "submitting" ? (
          <button className={btnPrimary} type="button" disabled>
            Submitting...
          </button>
        ) : (
          <button className={btnPrimary} onClick={goNext} type="button">
            Next
          </button>
        )}
      </div>
    </div>
  );
}
