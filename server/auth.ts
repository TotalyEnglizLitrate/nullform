import type { User } from "@supabase/supabase-js"
import { db } from "./db.js"
import { HttpError } from "./http.js"

export interface Session {
  user: User
  /** How this session was established (JWT `amr`): "otp", "oauth", ... */
  method: string
}

/** Validates the Supabase access token with the auth server (authoritative) and reads the sign-in method. */
export async function authenticate(req: Request): Promise<Session> {
  const token = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "")?.[1]
  if (!token) throw new HttpError(401, "unauthenticated")
  const { data, error } = await db().auth.getUser(token)
  if (error || !data.user) {
    // A rejected service key or an Auth outage is our fault, not the caller's; say so instead of "unauthenticated".
    if (error && error.status === 401 && /api key|apikey/i.test(error.message)) {
      console.error("Supabase rejected SUPABASE_SECRET_KEY while validating a user. Is it the full key from the dashboard?")
      throw new HttpError(500, "server_misconfigured")
    }
    if (error && (error.status ?? 0) >= 500) {
      console.error("Supabase Auth unavailable:", error.message)
      throw new HttpError(503, "auth_unavailable")
    }
    throw new HttpError(401, "unauthenticated")
  }
  return { user: data.user, method: amrMethod(token) }
}

function amrMethod(jwt: string): string {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString())
    const amr = payload.amr as { method?: string }[] | undefined
    return amr?.[0]?.method ?? ""
  } catch {
    return ""
  }
}
