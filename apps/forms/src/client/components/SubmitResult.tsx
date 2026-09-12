import type { SubmitErrorCode, SubmitResponse } from "../../shared/dto.ts";

const MESSAGES: Record<SubmitErrorCode, string> = {
  unauthenticated: "Your session expired. Please sign in again.",
  "form-not-found": "That form no longer exists.",
  "form-inactive": "That form is no longer accepting responses.",
  "validation-failed": "Some answers were invalid. Please check and try again.",
  "already-submitted": "You have already submitted this form.",
  "google-form-rejected": "The response could not be recorded. Please try again later.",
  "record-write-failed": "We could not write to your repo. Please try again.",
  "config-error": "This form is misconfigured. Please contact an admin.",
};

export function SubmitResult({ result, onExit }: { result: SubmitResponse; onExit: () => void }) {
  const ok = result.ok;
  return (
    <div className="space-y-4">
      <h1 className={`text-xl font-bold ${ok ? "text-emerald-600" : "text-rose-600"}`}>
        {ok ? "Thanks - your response was recorded." : "That didn't go through."}
      </h1>
      {ok && result.warning === "marker-write-failed" ? (
        <p className="text-sm text-amber-600">
          Your response was submitted, but we couldn't write the record that prevents duplicate
          submissions. If you submit again it may be counted twice. Please refrain from submitting
          again if the form is not built for this. Your responses will be discarded if you do.
        </p>
      ) : null}
      {ok ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {result.recordUri
            ? "Your full answers were published publicly to your repo."
            : "Your answers were not public. A public record confirming you submitted this form was posted to your repo."}
        </p>
      ) : null}
      {!ok ? (
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          {MESSAGES[result.code]}
          {result.detail ? <span className="block text-neutral-400">{result.detail}</span> : null}
        </p>
      ) : null}
      {ok && result.recordUri ? (
        <p className="break-all text-xs text-neutral-500">Record: {result.recordUri}</p>
      ) : null}
      <button
        className="inline-flex rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        onClick={onExit}
        type="button"
      >
        Back to forms
      </button>
    </div>
  );
}
