import type { AnswerValue, GoogleFormMapping } from "../../forms/types.ts";

export interface GoogleFormResult {
  accepted: boolean;
  status: number;
}

/**
 * Build the `entry.<id>` body for a Google Form from clean answers + a mapping.
 * Fields absent from `answers` (unreachable branches) are simply omitted.
 */
export function buildGoogleFormBody(
  mapping: GoogleFormMapping,
  answers: Record<string, AnswerValue>,
): Record<string, string | string[]> {
  if ("singleField" in mapping) {
    return { [mapping.singleField]: JSON.stringify(answers) };
  }
  const body: Record<string, string | string[]> = {};
  for (const [fieldId, entryId] of Object.entries(mapping.perQuestion)) {
    const value = answers[fieldId];
    if (value == null) continue;
    body[entryId] = value;
  }
  return body;
}

/**
 * POST a response to a Google Form. `formId` is the `/d/e/<ID>/` path segment.
 *
 * The target Google Form must be a **single page** (no section breaks) - the
 * app owns section flow / branching, and a flat `entry.*` POST is all a
 * single-page form needs. Google silently drops any `entry.<id>` it doesn't
 * recognise, so "accepted" only means the POST landed.
 */
export async function postToGoogleForm(
  formId: string,
  body: Record<string, string | string[]>,
): Promise<GoogleFormResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.append(key, value);
    }
  }

  let res: Response;
  try {
    res = await fetch(`https://docs.google.com/forms/d/e/${formId}/formResponse`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      redirect: "manual",
    });
  } catch (e) {
    console.error("postToGoogleForm fetch failed", e);
    return { accepted: false, status: 0 };
  }

  // 200 or an opaque redirect to the "response recorded" page both mean success.
  const accepted = res.status < 400 || res.status === 0;
  if (!accepted) {
    let snippet = "";
    try {
      snippet = (await res.text()).slice(0, 400).replace(/\s+/g, " ");
    } catch {
      /* ignore */
    }
    console.error("postToGoogleForm rejected", { formId, status: res.status, snippet });
  }
  return { accepted, status: res.status };
}
