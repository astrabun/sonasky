import { useEffect, useState } from "react";
import type { ArchivedFormSummary } from "../../shared/dto.ts";
import { listArchivedForms } from "../api.ts";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function ArchivedFormList({
  onOpen,
  onBack,
}: {
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const [forms, setForms] = useState<ArchivedFormSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listArchivedForms()
      .then(setForms)
      .catch(() => setError("Could not load archived forms."));
  }, []);

  return (
    <div className="space-y-6">
      <button className="text-sm text-sky-600 hover:underline" onClick={onBack} type="button">
        ← All forms
      </button>

      <div>
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">Archived Forms</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Forms that are no longer accepting responses.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : !forms ? (
        <p className="text-sm text-neutral-500">Loading archived forms...</p>
      ) : forms.length === 0 ? (
        <p className="text-sm text-neutral-500">No archived forms yet.</p>
      ) : (
        <ul className="space-y-3">
          {forms.map((f) => (
            <li
              key={f.id}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">
                      {f.title}
                    </h3>
                    {f.pinned ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                        Pinned
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">{formatDate(f.date)}</p>
                  {f.description ? (
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                      {f.description}
                    </p>
                  ) : null}
                </div>
                <button
                  className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  onClick={() => onOpen(f.id)}
                  type="button"
                >
                  View
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
