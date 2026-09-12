import { useCallback, useEffect, useState } from "react";
import type { FormDetailDTO } from "../shared/dto.ts";
import { getForm, loginHref, logout } from "./api.ts";
import { useAuth } from "./auth.tsx";
import { FormList } from "./components/FormList.tsx";
import { FormRunner } from "./components/FormRunner.tsx";

/** `/f/<form-id>` deep link -> form id, else null. */
function formIdFromPath(): string | null {
  const m = window.location.pathname.match(/^\/f\/([A-Za-z0-9._~-]+)\/?$/);
  return m ? m[1] : null;
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
  const [form, setForm] = useState<FormDetailDTO | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Keep openId in sync with browser back/forward.
  useEffect(() => {
    const onPop = () => setOpenId(formIdFromPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openForm = useCallback((id: string) => {
    if (formIdFromPath() !== id) window.history.pushState(null, "", `/f/${id}`);
    setOpenId(id);
  }, []);

  const closeForm = useCallback(() => {
    if (formIdFromPath() !== null) window.history.pushState(null, "", "/");
    setOpenId(null);
  }, []);

  useEffect(() => {
    if (!openId) {
      setForm(null);
      return;
    }
    setForm(null);
    setFormError(null);
    void getForm(openId).then((res) => {
      if ("ok" in res && res.ok === false) {
        setFormError(res.code === "form-inactive" ? "This form is closed." : "Form not found.");
      } else {
        setForm(res as FormDetailDTO);
      }
    });
  }, [openId]);

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
      ) : !me?.authenticated ? (
        <SignIn returnTo={openId ? `/f/${openId}` : "/"} />
      ) : openId ? (
        formError ? (
          <div className="space-y-4">
            <p className="text-sm text-rose-600">{formError}</p>
            <button
              className="text-sm text-sky-600 hover:underline"
              onClick={closeForm}
              type="button"
            >
              ← All forms
            </button>
          </div>
        ) : form ? (
          <FormRunner
            form={form}
            identity={{ did: me.did, handle: me.handle }}
            onExit={closeForm}
          />
        ) : (
          <p className="text-sm text-neutral-500">Loading form...</p>
        )
      ) : (
        <FormList onOpen={openForm} />
      )}
    </div>
  );
}
