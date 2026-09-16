import { useCallback, useEffect, useState } from "react";
import type { FormDetailDTO, FormUnavailable } from "../shared/dto.ts";
import { getForm, listArchivedForms, loginHref, logout } from "./api.ts";
import { useAuth } from "./auth.tsx";
import { ArchivedFormList } from "./components/ArchivedFormList.tsx";
import { FormList } from "./components/FormList.tsx";
import { FormRunner } from "./components/FormRunner.tsx";
import { MarkdownContent } from "./components/MarkdownContent.tsx";

/** `/f/<form-id>` deep link -> form id, else null. */
function formIdFromPath(): string | null {
  const m = window.location.pathname.match(/^\/f\/([A-Za-z0-9._~-]+)\/?$/);
  return m ? m[1] : null;
}

/** `/archived` deep link. */
function isArchivePath(): boolean {
  return window.location.pathname.replace(/\/+$/, "") === "/archived";
}

/** A handle looks like a dotted domain (alice.bsky.social), never like an email. */
const HANDLE_SHAPE_RE = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/;

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_handle: "That doesn't look like a Bluesky handle.",
  handle_not_found:
    "We couldn't find an account for that handle. Check the spelling and try again.",
  sign_in_failed: "Sign-in failed or was cancelled. Try again.",
};

function SignIn({ returnTo }: { returnTo: string }) {
  const [handle, setHandle] = useState("");
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
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Sign in with your Bluesky account to see the forms available to you.
      </p>
      {authErrorMessage ? (
        <p className="text-sm text-rose-600">
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
          if (handle.trim()) window.location.href = loginHref(handle, returnTo);
        }}
      >
        <div className="w-full">
          <input
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
          className="shrink-0 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          type="submit"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const { loading, me, refresh } = useAuth();
  const [openId, setOpenId] = useState<string | null>(() => formIdFromPath());
  const [showArchive, setShowArchive] = useState<boolean>(() => isArchivePath());
  const [form, setForm] = useState<FormDetailDTO | null>(null);
  const [formError, setFormError] = useState<FormUnavailable | null>(null);
  const [hasArchivedForms, setHasArchivedForms] = useState<boolean | null>(null);

  // Whether the archive has anything to show is auth-dependent (private closed
  // forms only count for signed-in viewers), so re-check whenever auth settles.
  useEffect(() => {
    if (loading) return;
    listArchivedForms()
      .then((forms) => setHasArchivedForms(forms.length > 0))
      .catch(() => setHasArchivedForms(null));
  }, [loading, me?.authenticated]);

  // Keep openId/showArchive in sync with browser back/forward.
  useEffect(() => {
    const onPop = () => {
      setOpenId(formIdFromPath());
      setShowArchive(isArchivePath());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openForm = useCallback((id: string) => {
    if (formIdFromPath() !== id) window.history.pushState(null, "", `/f/${id}`);
    setShowArchive(false);
    setOpenId(id);
  }, []);

  const closeForm = useCallback(() => {
    if (formIdFromPath() !== null) window.history.pushState(null, "", "/");
    setOpenId(null);
  }, []);

  const openArchive = useCallback(() => {
    if (!isArchivePath()) window.history.pushState(null, "", "/archived");
    setOpenId(null);
    setShowArchive(true);
  }, []);

  const closeArchive = useCallback(() => {
    if (isArchivePath()) window.history.pushState(null, "", "/");
    setShowArchive(false);
  }, []);

  useEffect(() => {
    if (!openId || loading) {
      setForm(null);
      return;
    }
    setForm(null);
    setFormError(null);
    void getForm(openId).then((res) => {
      if ("ok" in res && res.ok === false) {
        setFormError(res);
      } else {
        setForm(res as FormDetailDTO);
      }
    });
    // Re-fetch once auth settles/changes: a closed non-public form's details
    // are only included in the response once the caller is signed in.
  }, [openId, loading, me?.authenticated]);

  const signOut = useCallback(() => {
    void logout().finally(refresh);
  }, [refresh]);

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-10 text-neutral-900 dark:text-neutral-100">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-50">SonaSky Forms</h1>
        {me?.authenticated ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-500">{me.handle ?? me.did}</span>
            <button className="text-sky-600 hover:underline" onClick={signOut} type="button">
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : openId ? (
        formError ? (
          formError.authRequired ? (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                This is a closed form. Sign in to view it.
              </p>
              <SignIn returnTo={`/f/${openId}`} />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
                  {formError.title ?? "Form not found"}
                </h1>
                {formError.description ? (
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                    {formError.description}
                  </p>
                ) : null}
              </div>
              <p className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                {formError.code === "form-inactive"
                  ? "This form is closed and no longer accepting responses."
                  : "This form doesn't exist."}
              </p>
              {formError.postFormDetails ? (
                <MarkdownContent content={formError.postFormDetails} />
              ) : null}
              <button
                className="text-sm text-sky-600 hover:underline"
                onClick={closeForm}
                type="button"
              >
                ← All forms
              </button>
            </div>
          )
        ) : !form ? (
          <p className="text-sm text-neutral-500">Loading form...</p>
        ) : !me?.authenticated ? (
          <SignIn returnTo={`/f/${openId}`} />
        ) : (
          <FormRunner
            form={form}
            identity={{ did: me.did, handle: me.handle }}
            onExit={closeForm}
          />
        )
      ) : showArchive ? (
        <ArchivedFormList onOpen={openForm} onBack={closeArchive} />
      ) : !me?.authenticated ? (
        <SignIn returnTo="/" />
      ) : (
        <FormList onOpen={openForm} />
      )}

      {!openId && !showArchive && hasArchivedForms ? (
        <footer className="mt-10 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <button
            className="text-xs text-neutral-500 hover:underline"
            onClick={openArchive}
            type="button"
          >
            Archived Forms
          </button>
        </footer>
      ) : null}
    </div>
  );
}
