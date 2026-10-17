import { useState } from "react";
import type { MeResponse, ReportSubject } from "../../shared/dto.ts";
import type { ReportDestination } from "../../shared/moderation.ts";
import { api, ApiFailure } from "../api.ts";
import { SignIn } from "../components/SignIn.tsx";
import { Button, Card, Notice, TextArea } from "../components/ui.tsx";

/** `tools.ozone.report.defs#<name>` - inlined so the SPA doesn't bundle all of @atproto/api. */
const r = (name: string) => `tools.ozone.report.defs#${name}`;

// Same reason taxonomy as apps/sonasky-ref/.../ReportAssetDialog.tsx, with the
// ones most relevant to web pages (phishing, malware, impersonation) up front.
const REASON_GROUPS: { label: string; options: { value: string; label: string }[] }[] = [
  {
    label: "Scams and security",
    options: [
      {
        label: "Scam or phishing (trying to steal logins or money)",
        value: r("reasonMisleadingScam"),
      },
      { label: "Malware or harmful code", value: r("reasonRuleSiteSecurity") },
      { label: "Pretending to be someone else", value: r("reasonMisleadingImpersonation") },
      { label: "Spam", value: r("reasonMisleadingSpam") },
      { label: "Otherwise misleading", value: r("reasonMisleadingOther") },
    ],
  },
  {
    label: "Harassment and hate",
    options: [
      { label: "Targeted harassment", value: r("reasonHarassmentTargeted") },
      { label: "Hate speech", value: r("reasonHarassmentHateSpeech") },
      { label: "Doxxing (sharing private info)", value: r("reasonHarassmentDoxxing") },
      { label: "Other harassment", value: r("reasonHarassmentOther") },
    ],
  },
  {
    label: "Violence",
    options: [
      { label: "Threats", value: r("reasonViolenceThreats") },
      { label: "Graphic content", value: r("reasonViolenceGraphicContent") },
      { label: "Extremist content", value: r("reasonViolenceExtremistContent") },
      { label: "Animal abuse", value: r("reasonViolenceAnimal") },
      { label: "Other violence", value: r("reasonViolenceOther") },
    ],
  },
  {
    label: "Sexual content",
    options: [
      { label: "Adult content without a content warning", value: r("reasonSexualUnlabeled") },
      { label: "Non-consensual intimate images", value: r("reasonSexualNCII") },
      { label: "Deepfake", value: r("reasonSexualDeepfake") },
      { label: "Sexual abuse content", value: r("reasonSexualAbuseContent") },
      { label: "Other sexual content", value: r("reasonSexualOther") },
    ],
  },
  {
    label: "Child safety",
    options: [
      { label: "Child sexual abuse material", value: r("reasonChildSafetyCSAM") },
      { label: "Grooming", value: r("reasonChildSafetyGroom") },
      { label: "Other child safety", value: r("reasonChildSafetyOther") },
    ],
  },
  {
    label: "Self-harm",
    options: [
      { label: "Self-harm content", value: r("reasonSelfHarmContent") },
      { label: "Eating disorders", value: r("reasonSelfHarmED") },
    ],
  },
  {
    label: "Other",
    options: [
      { label: "Prohibited sales", value: r("reasonRuleProhibitedSales") },
      { label: "Something else", value: r("reasonOther") },
    ],
  },
];

const URI_RE = /^at:\/\/(did:[a-z]+:[a-zA-Z0-9._:%-]+)\/([a-zA-Z0-9.]+)\/([a-zA-Z0-9._~:-]+)$/;

type Scope = "item" | "site" | "account";

export function ReportPage({ me }: { me: MeResponse | null }) {
  const params = new URLSearchParams(window.location.search);
  const uri = params.get("uri") ?? "";
  const cid = params.get("cid") ?? "";
  const siteUri = params.get("site") ?? "";
  const siteCid = params.get("siteCid") ?? "";
  const match = URI_RE.exec(uri);
  const did = match?.[1];
  const isSiteRecord = uri === siteUri;

  const [scope, setScope] = useState<Scope>("item");
  const [reasonType, setReasonType] = useState<string>(REASON_GROUPS[0].options[0].value);
  const [reason, setReason] = useState("");
  const [destination, setDestination] = useState<ReportDestination>("bluesky");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!match || !cid) {
    return <Notice tone="warn">Open a site and use its “Report” link to report it.</Notice>;
  }

  if (!me?.authenticated) {
    return (
      <Card className="max-w-xl space-y-3">
        <h1 className="text-xl font-semibold">Report this site</h1>
        <SignIn
          returnTo={`${window.location.pathname}${window.location.search}`}
          purpose="report"
          intro="To stop abuse, reports are sent from a Bluesky account. Signing in here only lets Apollo send your report - it can't post or change anything in your account."
        />
      </Card>
    );
  }

  const subject = (): ReportSubject => {
    if (scope === "account" && did) return { did };
    if (scope === "site" && siteUri && siteCid) return { uri: siteUri, cid: siteCid };
    return { uri, cid };
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.report({
        subject: subject(),
        reasonType,
        reason: reason.trim() || undefined,
        destination,
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiFailure ? err.message : "Couldn't send the report. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Card className="max-w-xl space-y-3">
        <h1 className="text-xl font-semibold">Thanks - your report was sent</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          The moderation team will review it. If someone is in immediate danger, contact local
          emergency services.
        </p>
        <Button onClick={() => history.back()}>Go back</Button>
      </Card>
    );
  }

  return (
    <Card className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Report</h1>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">What are you reporting?</legend>
        {!isSiteRecord ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              checked={scope === "item"}
              onChange={() => setScope("item")}
            />
            This page
          </label>
        ) : null}
        {siteUri && siteCid ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              checked={scope === "site" || (isSiteRecord && scope === "item")}
              onChange={() => setScope("site")}
            />
            The whole site
          </label>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="scope"
            checked={scope === "account"}
            onChange={() => setScope("account")}
          />
          The account that made it
        </label>
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="report-reason" className="block text-sm font-medium">
          Reason
        </label>
        <select
          id="report-reason"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          value={reasonType}
          onChange={(e) => setReasonType(e.target.value)}
        >
          {REASON_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value + o.label} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <TextArea
        label="Anything else? (optional)"
        rows={3}
        maxLength={2000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Send to</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="dest"
            checked={destination === "bluesky"}
            onChange={() => setDestination("bluesky")}
          />
          Bluesky moderation (recommended)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="dest"
            checked={destination === "sonasky"}
            onChange={() => setDestination("sonasky")}
          />
          SonaSky
        </label>
      </fieldset>

      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button variant="primary" disabled={busy} onClick={submit}>
        {busy ? "Sending..." : "Send report"}
      </Button>
    </Card>
  );
}
