export { SONASKY_DID } from "@sonasky/labels-def";

/** Bluesky's moderation service (labeler + report intake). */
export const BSKY_LABELER_DID = "did:plc:ar7c4by46qjdydhdevvrndac";

/** Where a viewer can send a report. */
export type ReportDestination = "bluesky" | "sonasky";
