import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import Layout from "../../layouts/Home";
import { AnchorButton, Button } from "../../components/ui/Button";
import { isTrustedLinkDomain } from "../../helpers/trustedLinks";

function parseDestination(raw: string | null): URL | null {
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function Leaving() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const destination = useMemo(() => parseDestination(searchParams.get("url")), [searchParams]);

  // Guard against this page being reached with a missing/malformed URL, or one that's
  // actually trusted (e.g. a stale/crafted link) - there's nothing to warn about there.
  if (!destination || isTrustedLinkDomain(destination.hostname)) {
    return (
      <Layout>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h1 className="mb-2 text-2xl font-semibold">Nothing to see here</h1>
          <p>This page is only used to confirm links leaving SonaSky.</p>
          <Button variant="outlined" color="inherit" onClick={() => navigate("/")}>
            Go home
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div
        style={{
          padding: "2rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
          maxWidth: "40rem",
          margin: "0 auto",
        }}
      >
        <h1 className="text-2xl font-semibold">You are leaving SonaSky</h1>
        <p>You are leaving SonaSky for the below URL:</p>
        <p
          style={{
            wordBreak: "break-all",
            fontFamily: "monospace",
          }}
          className="rounded-md border border-gray-300 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900"
        >
          {destination.href}
        </p>
        <p>
          Please confirm your destination and report the account on Bluesky if you see something
          suspicious. You can learn more about Bluesky's approach to trust and safety at{" "}
          <a
            href="https://bsky.app/profile/safety.bsky.app"
            target="_blank"
            rel="noopener noreferrer"
          >
            @safety.bsky.app
          </a>
          .
        </p>
        <div style={{ display: "flex", gap: "1rem" }}>
          <AnchorButton
            variant="contained"
            color="warning"
            href={destination.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            Continue to site
          </AnchorButton>
          <Button variant="outlined" color="inherit" onClick={() => navigate(-1)}>
            Go back
          </Button>
        </div>
      </div>
    </Layout>
  );
}

export default Leaving;
