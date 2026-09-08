import { TID } from "@atproto/common-web";
import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { getForm } from "../../forms/registry.ts";
import type { Destination } from "../../forms/types.ts";
import type { SubmitError, SubmitRequest, SubmitResponse } from "../../shared/dto.ts";
import { getSessionAgent, type SessionAgent } from "../oauth/session.ts";
import {
  hasExistingSubmission,
  recordUriFor,
  writeResponseRecord,
  writeSubmissionMarker,
} from "../submission/atproto-record.ts";
import { buildGoogleFormBody, postToGoogleForm } from "../submission/google-form.ts";
import { validateSubmission, type ValidatedSubmission } from "../submission/validate.ts";
import { NSID_RESPONSE_DEFAULT, NSID_SUBMISSION } from "../../shared/nsid.ts";

export const submitRoutes = new Hono<{ Bindings: AppEnv }>();

function err(
  code: SubmitError["code"],
  status: 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502,
  detail?: string,
) {
  return { body: { ok: false, code, detail } satisfies SubmitError, status } as const;
}

/** Run the configured destinations; returns the response record uri (if any). */
async function runDestinations(
  env: AppEnv,
  session: SessionAgent,
  formId: string,
  destinations: Destination[],
  validated: ValidatedSubmission,
  markerUri: string,
): Promise<
  | { ok: true; recordUri?: string; googleFormAccepted?: boolean }
  | { ok: false; code: SubmitError["code"]; detail?: string }
> {
  const { cleanAnswers, visitedSectionIds } = validated;
  let recordUri: string | undefined;
  let googleFormAccepted: boolean | undefined;

  for (const dest of destinations) {
    if (dest.kind === "google-form") {
      const formGid = env[dest.formIdEnvVar as `GFORM_${string}`]?.trim();
      if (!formGid) {
        return { ok: false, code: "config-error", detail: `${dest.formIdEnvVar} is not set` };
      }
      const body = buildGoogleFormBody(dest.mapping, cleanAnswers);
      if (dest.submissionUriEntryId) {
        body[dest.submissionUriEntryId] = markerUri;
      }
      const res = await postToGoogleForm(formGid, body);
      if (!res.accepted) {
        return { ok: false, code: "google-form-rejected", detail: `status ${res.status}` };
      }
      googleFormAccepted = true;
    } else {
      try {
        const written = await writeResponseRecord(session.agent, {
          collection: dest.collection || NSID_RESPONSE_DEFAULT,
          formId,
          answers: cleanAnswers,
          visitedSections: visitedSectionIds,
        });
        recordUri = written.uri;
      } catch (e) {
        console.error("writeResponseRecord failed", e);
        return { ok: false, code: "record-write-failed" };
      }

      if (dest.alsoIndexToGoogleForm) {
        const gid = env[dest.alsoIndexToGoogleForm.formIdEnvVar as `GFORM_${string}`]?.trim();
        if (gid) {
          try {
            await postToGoogleForm(gid, {
              [dest.alsoIndexToGoogleForm.uriEntryId]: recordUri,
            });
          } catch (e) {
            console.warn("alsoIndexToGoogleForm failed (non-fatal)", e);
          }
        }
      }
    }
  }

  return { ok: true, recordUri, googleFormAccepted };
}

submitRoutes.post("/api/forms/:id/submit", async (c) => {
  const session = await getSessionAgent(c);
  if (!session) {
    const { body, status } = err("unauthenticated", 401);
    return c.json(body, status);
  }

  const form = getForm(c.req.param("id"));
  if (!form) {
    const { body, status } = err("form-not-found", 404);
    return c.json(body, status);
  }
  if (!form.active) {
    const { body, status } = err("form-inactive", 403);
    return c.json(body, status);
  }

  let payload: SubmitRequest;
  try {
    payload = (await c.req.json()) as SubmitRequest;
  } catch {
    const { body, status } = err("validation-failed", 422, "body is not JSON");
    return c.json(body, status);
  }
  const rawAnswers =
    payload && typeof payload === "object" && payload.answers && typeof payload.answers === "object"
      ? (payload.answers as Record<string, unknown>)
      : null;
  if (!rawAnswers) {
    const { body, status } = err("validation-failed", 422, "missing answers object");
    return c.json(body, status);
  }

  const needsHandle = form.sections.some((s) => s.fields.some((f) => f.prefill === "handle"));
  let handle: string | undefined;
  if (needsHandle) {
    try {
      const res = await session.agent.com.atproto.repo.describeRepo({ repo: session.did });
      handle = res.data.handle;
    } catch {
      // handle stays undefined; a required handle-prefill field will then fail validation
    }
  }

  const validation = validateSubmission(form, rawAnswers, { did: session.did, handle });
  if (!validation.ok) {
    console.warn("submit validation-failed", form.id, validation.detail);
    const { body, status } = err("validation-failed", 422, validation.detail);
    return c.json(body, status);
  }

  if (form.singleResponsePerUser) {
    try {
      if (await hasExistingSubmission(session.agent, form.id)) {
        const { body, status } = err("already-submitted", 409);
        return c.json(body, status);
      }
    } catch (e) {
      console.error("dedup check failed", e);
      const { body, status } = err("record-write-failed", 502, "could not verify prior submission");
      return c.json(body, status);
    }
  }

  // Pre-allocate the marker rkey so its at:// uri can be sent to a Google Form
  // even though the marker itself is written last.
  const markerRkey = TID.nextStr();
  const markerUri = recordUriFor(session.did, NSID_SUBMISSION, markerRkey);

  const destResult = await runDestinations(
    c.env,
    session,
    form.id,
    form.destinations,
    validation.value,
    markerUri,
  );
  if (!destResult.ok) {
    const status = destResult.code === "config-error" ? 500 : 502;
    return c.json(
      { ok: false, code: destResult.code, detail: destResult.detail } satisfies SubmitError,
      status,
    );
  }

  const submittedAt = new Date().toISOString();
  try {
    const marker = await writeSubmissionMarker(session.agent, {
      formId: form.id,
      submittedAt,
      responseUri: destResult.recordUri,
      rkey: markerRkey,
    });
    return c.json<SubmitResponse>({
      ok: true,
      markerUri: marker.uri,
      recordUri: destResult.recordUri,
      googleFormAccepted: destResult.googleFormAccepted,
    });
  } catch (e) {
    // External writes already happened and cannot be rolled back; degrade.
    console.error("writeSubmissionMarker failed AFTER external writes", e);
    return c.json<SubmitResponse>({
      ok: true,
      markerUri: "",
      recordUri: destResult.recordUri,
      googleFormAccepted: destResult.googleFormAccepted,
      warning: "marker-write-failed",
    });
  }
});
