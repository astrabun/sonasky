import { useEffect, useState } from "react";
import type { FormSummary } from "../../shared/dto.ts";
import { listForms } from "../api.ts";

export function FormList({ onOpen }: { onOpen: (id: string) => void }) {
  const [forms, setForms] = useState<FormSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listForms()
      .then(setForms)
      .catch(() => setError("Could not load forms."));
  }, []);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!forms) return <p className="text-sm text-neutral-500">Loading forms...</p>;
  if (forms.length === 0) return <p className="text-sm text-neutral-500">No forms available.</p>;

  return (
    <ul className="space-y-3">
      {forms.map((f) => {
        const done = f.singleResponsePerUser && f.alreadySubmitted;
        return (
          <li
            key={f.id}
            className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">{f.title}</h3>
                  {f.publishesFullResponse ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      Public responses
                    </span>
                  ) : null}
                </div>
                {f.description ? (
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                    {f.description}
                  </p>
                ) : null}
              </div>
              <button
                className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                disabled={done}
                onClick={() => onOpen(f.id)}
                type="button"
              >
                {done ? "Submitted" : "Open"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
