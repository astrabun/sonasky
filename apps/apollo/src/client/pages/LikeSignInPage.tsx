import { useEffect } from "react";
import type { MeResponse } from "../../shared/dto.ts";
import { SignIn } from "../components/SignIn.tsx";
import { Card, Spinner } from "../components/ui.tsx";

/** Same-origin paths only; anything else goes to Discover. */
function safeReturn(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/discover";
}

/**
 * Sign in so you can like sites. Reached from a Like button when the visitor
 * isn't signed in (or their session can't write likes); goes back to `return`
 * once they can. Viewer pages are served by the Worker, hence full navigations.
 */
export function LikeSignInPage({ me }: { me: MeResponse | null }) {
  const returnTo = safeReturn(new URLSearchParams(window.location.search).get("return"));
  const ready = me?.authenticated === true && me.canLike;

  useEffect(() => {
    if (ready) window.location.replace(returnTo);
  }, [ready, returnTo]);

  if (ready) return <Spinner label="Taking you back..." />;
  return (
    <Card className="mx-auto max-w-md space-y-3">
      <h1 className="text-lg font-semibold">Sign in to like sites</h1>
      <SignIn
        returnTo={returnTo}
        purpose="like"
        intro="Likes are saved in your Bluesky account, so they're yours to keep or remove. Signing in here only lets Apollo save likes (and send reports) - it can't post or change anything else."
      />
    </Card>
  );
}
