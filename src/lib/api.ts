export class ApiError extends Error {
  constructor(public status: number, public code: string, public body: Record<string, unknown> = {}) {
    super(code)
  }
}

/** POST to our own /api. Pass a token only for authenticated calls; submissions never carry one. */
export async function post<T = Record<string, unknown>>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: "POST",
    credentials: "omit",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "request_failed", data)
  return data as T
}

const MESSAGES: Record<string, string> = {
  unauthenticated: "Please sign in first.",
  not_eligible: "This account isn't eligible for this form.",
  unverified_identity: "Your account's email address couldn't be verified.",
  already_registered: "You're already registered for this form.",
  commitment_taken: "That identity is already in the group.",
  registration_closed: "Registration for this form is closed.",
  group_full: "This form's group is full.",
  submissions_closed: "This form isn't accepting submissions right now.",
  already_submitted: "A submission from your identity was already received.",
  invalid_payload: "Some answers aren't valid. Please check the form.",
  wrong_root: "The group changed or your identity isn't in it.",
  wrong_status: "That isn't possible in this form's current state.",
  empty_group: "Nobody has registered yet.",
  form_not_found: "Form not found.",
  server_misconfigured: "The server is misconfigured, so this can't work right now. Please tell whoever runs this site.",
  auth_unavailable: "Sign-in is unavailable right now. Please try again in a moment.",
}
export const explain = (e: unknown) =>
  e instanceof ApiError ? (MESSAGES[e.code] ?? `Request failed (${e.code}).`) : e instanceof Error ? e.message : "Something went wrong."
