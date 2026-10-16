import { useEffect, useState } from "react";
import type { PreviewRequest } from "../../shared/dto.ts";
import type { SiteRecord, StyleRecord } from "../../shared/records.ts";
import { api, ApiFailure } from "../api.ts";
import { useEditorState } from "./context.tsx";

/**
 * Live preview, rendered by the same Worker code as the published site and
 * shown in a fully sandboxed `srcdoc` iframe (no scripts, no navigation).
 * Script records only run on the published site.
 */
export function Preview({
  target,
  site: siteOverride,
  theme: themeOverride,
  height = "70vh",
}: {
  target: PreviewRequest["target"] | null;
  site?: SiteRecord;
  theme?: StyleRecord;
  height?: string;
}) {
  const { bundle, site } = useEditorState();
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const siteRecord = siteOverride ?? site.value;
  const theme = themeOverride ?? bundle.styles.find((s) => s.rkey === siteRecord.theme)?.value;
  const pageStyles = (target?.record.styles ?? [])
    .map((rkey) => bundle.styles.find((s) => s.rkey === rkey)?.value)
    .filter((s): s is StyleRecord => Boolean(s));
  const layoutKey = target?.record.layout ?? siteRecord.defaultLayout;
  const layout = layoutKey ? bundle.layouts.find((l) => l.rkey === layoutKey)?.value : undefined;

  const request: PreviewRequest | null = target
    ? {
        site: siteRecord,
        target,
        styles: [
          theme ?? {
            $type: "app.sonasky.apollo.style",
            name: "default",
            createdAt: "",
            updatedAt: "",
          },
          ...pageStyles,
        ],
        layout,
      }
    : null;
  const requestKey = JSON.stringify(request);

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .preview(request)
        .then((res) => {
          if (cancelled) return;
          setHtml(res.html);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof ApiFailure ? err.message : "Preview isn't available right now.");
        })
        .finally(() => !cancelled && setLoading(false));
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // requestKey captures every input that changes the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>Preview {loading ? "· updating..." : ""}</span>
        <span>Links and scripts work on the published site.</span>
      </div>
      {error ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          The preview will update once this is fixed: {error}
        </p>
      ) : null}
      <iframe
        title="Page preview"
        sandbox=""
        srcDoc={html}
        className="w-full rounded-lg border border-neutral-200 bg-white dark:border-neutral-800"
        style={{ height }}
      />
    </div>
  );
}
