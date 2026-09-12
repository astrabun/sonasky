import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { getForm, listActiveForms } from "../../forms/registry.ts";
import type { FormDefinition } from "../../forms/types.ts";
import type { FormDetailDTO, FormSummary } from "../../shared/dto.ts";
import { getSessionAgent } from "../oauth/session.ts";
import { listSubmittedFormIds } from "../submission/atproto-record.ts";

export const formsRoutes = new Hono<{ Bindings: AppEnv }>();

function toSummary(form: FormDefinition, alreadySubmitted: boolean): FormSummary {
  return {
    id: form.id,
    title: form.title,
    description: form.description,
    singleResponsePerUser: form.singleResponsePerUser,
    alreadySubmitted,
    publishesFullResponse: form.destinations.some((d) => d.kind === "atproto-record"),
  };
}

/** List active forms. When authed, mark which single-response forms are done. */
formsRoutes.get("/api/forms", async (c) => {
  const forms = listActiveForms();
  const session = await getSessionAgent(c);

  let submitted = new Set<string>();
  if (session) {
    try {
      submitted = await listSubmittedFormIds(session.agent);
    } catch (err) {
      console.warn("listSubmittedFormIds failed", err);
    }
  }

  return c.json<FormSummary[]>(
    forms.map((f) => toSummary(f, f.singleResponsePerUser && submitted.has(f.id))),
  );
});

/** Full form detail (sections + routing), destinations stripped. */
formsRoutes.get("/api/forms/:id", async (c) => {
  const form = getForm(c.req.param("id"));
  if (!form) return c.json({ ok: false, code: "form-not-found" }, 404);
  if (!form.active) return c.json({ ok: false, code: "form-inactive" }, 404);

  const session = await getSessionAgent(c);
  let alreadySubmitted = false;
  if (session && form.singleResponsePerUser) {
    try {
      alreadySubmitted = (await listSubmittedFormIds(session.agent)).has(form.id);
    } catch (err) {
      console.warn("listSubmittedFormIds failed", err);
    }
  }

  const dto: FormDetailDTO = {
    ...toSummary(form, alreadySubmitted),
    sections: form.sections,
  };
  return c.json(dto);
});
