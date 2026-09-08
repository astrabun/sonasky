import type { FormDefinition } from "../types.ts";

/**
 * SonaSky Open Feedback.
 *
 * A standing form for generic feedback at any time, unconnected to any ongoing
 * survey. Users may submit as many times as they like.
 *
 * Google Form: supplied via the `GFORM_OPEN_FEEDBACK` env var. `entry.*` ids are
 * from the form's "Get pre-filled link" URL.
 */

export const openFeedback: FormDefinition = {
  id: "000-sonasky-open-feedback",
  title: "SonaSky Open Feedback",
  description: "This form allows generic feedback at any time, not related to any ongoing surveys.",
  active: true,
  singleResponsePerUser: false,
  sections: [
    {
      id: "feedback",
      fields: [
        {
          id: "bluesky_id",
          type: "text",
          label: "What is your Bluesky handle?",
          help: "Filled in automatically from your Bluesky account (your DID).",
          prefill: "did",
          maxLength: 256,
        },
        {
          id: "message",
          type: "longtext",
          label: "Feedback Message",
          help: "Please leave your feedback here.",
          required: true,
          maxLength: 10000,
        },
      ],
      // single section => submit
    },
  ],
  destinations: [
    {
      kind: "google-form",
      formIdEnvVar: "GFORM_OPEN_FEEDBACK",
      mapping: {
        perQuestion: {
          bluesky_id: "entry.265437195",
          message: "entry.379375099",
        },
      },
      submissionUriEntryId: "entry.724693273",
    },
  ],
};
