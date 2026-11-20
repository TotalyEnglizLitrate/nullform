export class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code)
  }
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })

/** Reads a JSON object body, refusing anything over 64 KB. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text()
  if (text.length > 64_000) throw new HttpError(413, "body_too_large")
  try {
    const v = JSON.parse(text)
    if (typeof v === "object" && v !== null && !Array.isArray(v)) return v as Record<string, unknown>
  } catch {}
  throw new HttpError(400, "invalid_json")
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Maps the error names raised by the SQL functions to HTTP statuses. */
const SQL_ERRORS: Record<string, number> = {
  form_not_found: 404,
  registration_closed: 409,
  group_full: 409,
  already_registered: 409,
  commitment_taken: 409,
  wrong_status: 409,
  empty_group: 409,
  leaf_count_mismatch: 409,
  submissions_closed: 403,
  already_submitted: 409,
  already_anchored: 409,
}

export function sqlError(message: string): HttpError {
  const status = SQL_ERRORS[message]
  if (status) return new HttpError(status, message)
  console.error("unexpected database error:", message)
  return new HttpError(500, "internal_error")
}

/** Wraps a handler: only POST, and every thrown HttpError becomes a JSON error. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" })
    try {
      return await fn(req)
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.code })
      console.error(e)
      return json(500, { error: "internal_error" })
    }
  }
}
