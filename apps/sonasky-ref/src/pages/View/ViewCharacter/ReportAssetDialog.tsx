import { useState } from "react";
import { type Agent, ToolsOzoneReportDefs } from "@atproto/api";
import { SONASKY_DID } from "@sonasky/labels-def";
import { Button } from "../../../components/ui/Button";
import { Dialog, DialogActions, DialogContent, DialogTitle } from "../../../components/ui/Dialog";
import { TextField } from "../../../components/ui/TextField";
import { BSKY_LABELER_DID } from "../../../const";

interface AssetRef {
  uri: string;
  cid: string;
}

interface ReportAssetDialogProps {
  open: boolean;
  onClose: () => void;
  assetRef: AssetRef;
  pdsAgent: Agent;
}

type LabelerChoice = "sonasky" | "bluesky";

const REASON_GROUPS: { label: string; options: { value: string; label: string }[] }[] = [
  {
    label: "Violence",
    options: [
      { label: "Animal abuse", value: ToolsOzoneReportDefs.REASONVIOLENCEANIMAL },
      { label: "Threats", value: ToolsOzoneReportDefs.REASONVIOLENCETHREATS },
      { label: "Graphic content", value: ToolsOzoneReportDefs.REASONVIOLENCEGRAPHICCONTENT },
      { label: "Glorification", value: ToolsOzoneReportDefs.REASONVIOLENCEGLORIFICATION },
      { label: "Extremist content", value: ToolsOzoneReportDefs.REASONVIOLENCEEXTREMISTCONTENT },
      { label: "Trafficking", value: ToolsOzoneReportDefs.REASONVIOLENCETRAFFICKING },
      { label: "Other", value: ToolsOzoneReportDefs.REASONVIOLENCEOTHER },
    ],
  },
  {
    label: "Sexual Content",
    options: [
      { label: "Abuse content", value: ToolsOzoneReportDefs.REASONSEXUALABUSECONTENT },
      { label: "Non-consensual intimate images", value: ToolsOzoneReportDefs.REASONSEXUALNCII },
      { label: "Deepfake", value: ToolsOzoneReportDefs.REASONSEXUALDEEPFAKE },
      { label: "Other", value: ToolsOzoneReportDefs.REASONSEXUALOTHER },
    ],
  },
  {
    label: "Child Safety",
    options: [
      { label: "CSAM", value: ToolsOzoneReportDefs.REASONCHILDSAFETYCSAM },
      { label: "Grooming", value: ToolsOzoneReportDefs.REASONCHILDSAFETYGROOM },
      { label: "Privacy", value: ToolsOzoneReportDefs.REASONCHILDSAFETYPRIVACY },
      { label: "Harassment", value: ToolsOzoneReportDefs.REASONCHILDSAFETYHARASSMENT },
      { label: "Other", value: ToolsOzoneReportDefs.REASONCHILDSAFETYOTHER },
    ],
  },
  {
    label: "Harassment",
    options: [
      { label: "Trolling", value: ToolsOzoneReportDefs.REASONHARASSMENTTROLL },
      { label: "Targeted", value: ToolsOzoneReportDefs.REASONHARASSMENTTARGETED },
      { label: "Hate speech", value: ToolsOzoneReportDefs.REASONHARASSMENTHATESPEECH },
      { label: "Doxxing", value: ToolsOzoneReportDefs.REASONHARASSMENTDOXXING },
      { label: "Other", value: ToolsOzoneReportDefs.REASONHARASSMENTOTHER },
    ],
  },
  {
    label: "Misleading",
    options: [
      { label: "Spam", value: ToolsOzoneReportDefs.REASONMISLEADINGSPAM },
      { label: "Scam", value: ToolsOzoneReportDefs.REASONMISLEADINGSCAM },
      { label: "Other", value: ToolsOzoneReportDefs.REASONMISLEADINGOTHER },
    ],
  },
  {
    label: "Rule Violations",
    options: [
      { label: "Site security", value: ToolsOzoneReportDefs.REASONRULESITESECURITY },
      { label: "Prohibited sales", value: ToolsOzoneReportDefs.REASONRULEPROHIBITEDSALES },
      { label: "Ban evasion", value: ToolsOzoneReportDefs.REASONRULEBANEVASION },
      { label: "Other", value: ToolsOzoneReportDefs.REASONRULEOTHER },
    ],
  },
  {
    label: "Self-Harm",
    options: [
      { label: "Content", value: ToolsOzoneReportDefs.REASONSELFHARMCONTENT },
      { label: "Eating disorder", value: ToolsOzoneReportDefs.REASONSELFHARMED },
      { label: "Stunts", value: ToolsOzoneReportDefs.REASONSELFHARMSTUNTS },
      { label: "Substances", value: ToolsOzoneReportDefs.REASONSELFHARMSUBSTANCES },
      { label: "Other", value: ToolsOzoneReportDefs.REASONSELFHARMOTHER },
    ],
  },
  {
    label: "General",
    options: [{ label: "Other", value: ToolsOzoneReportDefs.REASONOTHER }],
  },
];

const DEFAULT_REASON_TYPE = REASON_GROUPS[REASON_GROUPS.length - 1].options[0].value;

const selectClassName =
  "w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900";

export function ReportAssetDialog({ open, onClose, assetRef, pdsAgent }: ReportAssetDialogProps) {
  const [labelerChoice, setLabelerChoice] = useState<LabelerChoice>("bluesky");
  const [reasonType, setReasonType] = useState<string>(DEFAULT_REASON_TYPE);
  const [reasonText, setReasonText] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>("");
  const [submitted, setSubmitted] = useState<boolean>(false);

  const handleClose = () => {
    onClose();
    setLabelerChoice("bluesky");
    setReasonType(DEFAULT_REASON_TYPE);
    setReasonText("");
    setSubmitError("");
    setSubmitted(false);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const labelerDid = labelerChoice === "sonasky" ? SONASKY_DID : BSKY_LABELER_DID;
      await pdsAgent.withProxy("atproto_labeler", labelerDid).com.atproto.moderation.createReport({
        reason: reasonText || undefined,
        reasonType,
        subject: { $type: "com.atproto.repo.strongRef", cid: assetRef.cid, uri: assetRef.uri },
      });
      setSubmitted(true);
    } catch (error) {
      console.error("Failed to submit report", error);
      setSubmitError("Failed to submit report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md">
      <DialogTitle>Report Image</DialogTitle>
      <DialogContent>
        {submitted ? (
          <p className="text-sm">Thanks, your report has been submitted.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1 block text-sm font-medium">Report to</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="labelerChoice"
                    checked={labelerChoice === "bluesky"}
                    onChange={() => setLabelerChoice("bluesky")}
                  />
                  Bluesky Moderation Services
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="labelerChoice"
                    checked={labelerChoice === "sonasky"}
                    onChange={() => setLabelerChoice("sonasky")}
                  />
                  SonaSky
                </label>
              </div>
            </div>
            <div>
              <label htmlFor="report-reason-type" className="mb-1 block text-sm font-medium">
                Reason
              </label>
              <select
                id="report-reason-type"
                className={selectClassName}
                value={reasonType}
                onChange={(e) => setReasonType(e.target.value)}
              >
                {REASON_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <TextField
              label="Additional details (optional)"
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              multiline
              rows={3}
              maxLength={2000}
            />
            {submitError && <p className="text-sm text-red-600">{submitError}</p>}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          {submitted ? "Close" : "Cancel"}
        </Button>
        {!submitted && (
          <Button onClick={() => void handleSubmit()} color="error" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Report"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
