import type { FormDefinition } from "../types.ts";

/**
 * 2026-09 SonaSky Species Request Form.
 *
 * Google Form: supplied via the `GFORM_SPECIES_REQUEST_2026_09` env var. `entry.*`
 * ids are from the form's "Get pre-filled link" URL.
 */

const opt = (value: string) => ({ value, label: value });

export const speciesRequest202609: FormDefinition = {
  id: "sonasky-species-request-2026-09",
  title: "SonaSky Species Request Form 2026-09",
  description:
    "This form will be used to collect responses on what SonaSky species labels are currently " +
    "missing that users want to see added. Because there is an upper limit to data size on " +
    "labelers on AT Protocol, we cannot accept every label. We have room " +
    "because we recently purged 10 labels that had zero active users.",
  active: true,
  date: "2026-09-18",
  singleResponsePerUser: false,
  sections: [
    {
      id: "request",
      fields: [
        {
          id: "bluesky_id",
          type: "text",
          label: "Bluesky DID/Handle",
          required: true,
          prefill: "did",
          maxLength: 256,
        },
        {
          id: "species",
          type: "text",
          label: "What species label would you like added to SonaSky?",
          help:
            "One per form response; if you have another to request, fill out this form a second " +
            "time. Please only make one request per species.",
          required: true,
          maxLength: 256,
        },
        {
          id: "labeler",
          type: "single-select",
          label: "What labeler would this fit on?",
          help:
            "Please note that this form is *not* for requesting net-new labelers (e.g., Digimon, " +
            "which is being actively considered).",
          required: true,
          options: [opt("SonaSky"), opt("SonaSky Pokemon")],
        },
        {
          id: "additional_comments",
          type: "longtext",
          label: "Additional Comments and/or Justification",
          help:
            "If you have anything additional to add, please mention here. Please do not use this " +
            "space for a second label request - instead, submit another form response.",
          required: false,
          maxLength: 10000,
        },
        {
          id: "acknowledgement",
          type: "single-select",
          label:
            "I understand that my label request may not be accepted if there is not sufficient " +
            "interest for the species (>= 5-10 users ask for it)",
          required: true,
          options: [opt("Yes")],
        },
      ],
      // single section => submit
    },
  ],
  destinations: [
    {
      kind: "google-form",
      formIdEnvVar: "GFORM_SPECIES_REQUEST_2026_09",
      mapping: {
        perQuestion: {
          bluesky_id: "entry.1853425379",
          species: "entry.1776852491",
          labeler: "entry.1022357075",
          additional_comments: "entry.373376470",
          acknowledgement: "entry.1459823123",
        },
      },
      submissionUriEntryId: "entry.1949884850",
    },
  ],
};
