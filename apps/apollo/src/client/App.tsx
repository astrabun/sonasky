import { lazy, Suspense, useCallback, useState } from "react";
import { Sun } from "lucide-react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router";
import { logout } from "./api.ts";
import { useAuth } from "./auth.tsx";
import { ShareBanner } from "./components/ShareBanner.tsx";
import { SignIn } from "./components/SignIn.tsx";
import { Card, Spinner } from "./components/ui.tsx";
import { DiscoverPage } from "./pages/DiscoverPage.tsx";
import { HelpPage } from "./pages/HelpPage.tsx";
import { Landing } from "./pages/Landing.tsx";
import { LikeSignInPage } from "./pages/LikeSignInPage.tsx";
import { ReportPage } from "./pages/ReportPage.tsx";

// The editor pulls in tiptap + CodeMirror; keep them out of the landing/report pages.
const Dashboard = lazy(() =>
  import("./editor/EditorShell.tsx").then((m) => ({ default: m.Dashboard })),
);

function ReauthNotice() {
  const { pathname, search } = useLocation();
  return (
    <Card className="mx-auto max-w-md space-y-3">
      <h1 className="text-lg font-semibold">Please sign in again</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Apollo needs updated permission to edit your site (for example, if you last signed in only
        to like a site or send a report).
      </p>
      <SignIn returnTo={pathname.startsWith("/edit") ? `${pathname}${search}` : "/edit"} />
    </Card>
  );
}

/** Signed out under /edit: invite links get a sign-in prompt, everything else goes home. */
function SignedOutEdit() {
  const { pathname, search } = useLocation();
  if (!pathname.startsWith("/edit/rings/join")) return <Navigate to="/" replace />;
  return (
    <Card className="mx-auto max-w-md space-y-3">
      <h1 className="text-lg font-semibold">You've been invited to a ring</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Sign in with your Bluesky account to see the invite.
      </p>
      <SignIn returnTo={`${pathname}${search}`} />
    </Card>
  );
}

/** The share banner shows on the home page and in the editor only. */
function RouteBanner() {
  const { pathname } = useLocation();
  const show = pathname === "/" || pathname === "/edit" || pathname.startsWith("/edit/");
  return show ? <ShareBanner /> : null;
}

export default function App() {
  const { loading, me, refresh } = useAuth();
  const [needsReauth, setNeedsReauth] = useState(false);
  const onReauth = useCallback(() => setNeedsReauth(true), []);
  const signOut = useCallback(() => {
    void logout().finally(() => {
      refresh();
      window.location.href = "/";
    });
  }, [refresh]);

  const signedIn = me?.authenticated === true;
  const canEdit = signedIn && !me.reauthRequired && !needsReauth;

  return (
    <BrowserRouter>
      <RouteBanner />
      <div className="mx-auto min-h-screen max-w-7xl px-4 py-6 text-neutral-900 dark:text-neutral-100">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold">
            <Sun size={20} className="text-amber-500" aria-hidden />
            SonaSky Apollo
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/discover" className="text-sky-700 hover:underline dark:text-sky-400">
              Discover
            </Link>
            {signedIn ? (
              <>
                <span className="hidden text-neutral-500 sm:inline">{me.handle ?? me.did}</span>
                <button
                  className="text-sky-700 hover:underline dark:text-sky-400"
                  onClick={signOut}
                  type="button"
                >
                  Sign out
                </button>
              </>
            ) : null}
          </div>
        </header>
        <main>
          {loading ? (
            <Spinner />
          ) : (
            <Routes>
              <Route
                path="/"
                element={
                  canEdit ? (
                    <Navigate to="/edit" replace />
                  ) : signedIn ? (
                    <ReauthNotice />
                  ) : (
                    <Landing />
                  )
                }
              />
              <Route
                path="/edit/*"
                element={
                  canEdit ? (
                    <Suspense fallback={<Spinner label="Loading the editor..." />}>
                      <Dashboard onReauth={onReauth} />
                    </Suspense>
                  ) : signedIn ? (
                    <ReauthNotice />
                  ) : (
                    <SignedOutEdit />
                  )
                }
              />
              <Route path="/report" element={<ReportPage me={me} />} />
              <Route path="/like" element={<LikeSignInPage me={me} />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/discover" element={<DiscoverPage tab="sites" me={me} />} />
              <Route path="/discover/rings" element={<DiscoverPage tab="rings" me={me} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </BrowserRouter>
  );
}
