import type {
  FormDetailDTO,
  FormSummary,
  MeResponse,
  SubmitRequest,
  SubmitResponse,
} from "../shared/dto.ts";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok && res.status !== 409 && res.status !== 422) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function getMe(): Promise<MeResponse> {
  return fetch("/api/me").then((r) => json<MeResponse>(r));
}

export function listForms(): Promise<FormSummary[]> {
  return fetch("/api/forms").then((r) => json<FormSummary[]>(r));
}

export function getForm(id: string): Promise<FormDetailDTO | { ok: false; code: string }> {
  return fetch(`/api/forms/${encodeURIComponent(id)}`).then((r) =>
    json<FormDetailDTO | { ok: false; code: string }>(r),
  );
}

export function submitForm(id: string, body: SubmitRequest): Promise<SubmitResponse> {
  return fetch(`/api/forms/${encodeURIComponent(id)}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => json<SubmitResponse>(r));
}

export function loginHref(handle: string, returnTo?: string): string {
  const params = new URLSearchParams({ handle: handle.trim() });
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    params.set("return", returnTo);
  }
  return `/oauth/login?${params.toString()}`;
}

export function logout(): Promise<unknown> {
  return fetch("/oauth/logout", { method: "POST" });
}
