import { useEffect, useState } from "react";
import { loginHref, type SignInPurpose } from "../api.ts";

/** A handle looks like a dotted domain (alice.bsky.social). */
const HANDLE_SHAPE_RE = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/;

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_handle: "That doesn't look like a Bluesky handle.",
  handle_not_found:
    "We couldn't find an account for that handle. Check the spelling and try again.",
  sign_in_failed: "Sign-in failed or was cancelled. Try again.",
};

export function SignIn({
  returnTo,
  purpose,
  intro,
}: {
  returnTo: string;
  purpose?: SignInPurpose;
  intro?: string;
}) {
  const [handle, setHandle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Coming back via the back button can restore this page from bfcache with the
  // button still disabled; re-enable it.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setSubmitting(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  const params = new URLSearchParams(window.location.search);
  const authError = params.get("auth_error");
  const hint = params.get("hint");
  const authErrorMessage = authError
    ? (AUTH_ERROR_MESSAGES[authError] ?? AUTH_ERROR_MESSAGES.sign_in_failed)
    : null;

  const normalized = handle.trim().replace(/^@/, "").toLowerCase();
  const emailTypoHint =
    normalized && !HANDLE_SHAPE_RE.test(normalized) && normalized.includes("@")
      ? normalized.replace(/@/g, ".")
      : null;

  return (
    <div className="space-y-3">
      {intro ? <p className="text-sm text-neutral-600 dark:text-neutral-300">{intro}</p> : null}
      {authErrorMessage ? (
        <p className="text-sm text-rose-600" role="alert">
          {authErrorMessage}
          {hint ? (
            <>
              {" "}
              Did you mean <span className="font-medium">{hint}</span>?
            </>
          ) : null}
        </p>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          // Guard against double-submits: each one starts a new sign-in on the server.
          if (submitting || !handle.trim()) return;
          setSubmitting(true);
          window.location.href = loginHref(handle, returnTo, purpose);
        }}
      >
        <div className="w-full">
          <label htmlFor="apollo-handle" className="sr-only">
            Your Bluesky handle
          </label>
          <input
            id="apollo-handle"
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            placeholder="you.bsky.social"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {emailTypoHint ? (
            <p className="mt-1 text-xs text-amber-600">
              Handles look like a domain, not an email - try{" "}
              <button type="button" className="underline" onClick={() => setHandle(emailTypoHint)}>
                {emailTypoHint}
              </button>
              ?
            </p>
          ) : null}
        </div>
        <button
          className="shrink-0 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-60"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
