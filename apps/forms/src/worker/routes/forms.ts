import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { allForms, getForm, listActiveForms } from "../../forms/registry.ts";
import type { FormDefinition } from "../../forms/types.ts";
import type {
  ArchivedFormSummary,
  FormDetailDTO,
  FormSummary,
  FormUnavailable,
} from "../../shared/dto.ts";
import { getSessionAgent } from "../oauth/session.ts";
import { listSubmittedFormIds } from "../submission/atproto-record.ts";

export const formsRoutes = new Hono<{ Bindings: AppEnv }>();

function toSummary(form: FormDefinition, alreadySubmitted: boolean): FormSummary {
  return {
    id: form.id,
    title: form.title,
    description: form.description,
    date: form.date,
    pinned: form.pinned,
    singleResponsePerUser: form.singleResponsePerUser,
    alreadySubmitted,
    publishesFullResponse: form.destinations.some((d) => d.kind === "atproto-record"),
  };
}

/** Newest first, but pinned entries always come before unpinned ones. */
function byPinnedThenDate(a: FormDefinition, b: FormDefinition): number {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  return b.date.localeCompare(a.date);
}

/** List active forms. When authed, mark which single-response forms are done. */
formsRoutes.get("/api/forms", async (c) => {
  const forms = [...listActiveForms()].sort(byPinnedThenDate);
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

/** List closed (inactive) forms, newest first, pinned entries first. Signed-out
 * callers only see forms marked `publicArchive`. */
formsRoutes.get("/api/forms/archived", async (c) => {
  const session = await getSessionAgent(c);
  const forms = allForms()
    .filter((f) => !f.active && (session || f.publicArchive))
    .sort(byPinnedThenDate);

  return c.json<ArchivedFormSummary[]>(
    forms.map((f) => ({ ...toSummary(f, false), postFormDetails: f.postFormDetails })),
  );
});

/** Full form detail (sections + routing), destinations stripped. */
formsRoutes.get("/api/forms/:id", async (c) => {
  const form = getForm(c.req.param("id"));
  if (!form) {
    return c.json<FormUnavailable>({ ok: false, code: "form-not-found" }, 404);
  }

  const session = await getSessionAgent(c);

  if (!form.active) {
    if (!form.publicArchive && !session) {
      return c.json<FormUnavailable>({ ok: false, code: "form-inactive", authRequired: true }, 404);
    }
    return c.json<FormUnavailable>(
      {
        ok: false,
        code: "form-inactive",
        title: form.title,
        description: form.description,
        postFormDetails: form.postFormDetails,
      },
      404,
    );
  }

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
