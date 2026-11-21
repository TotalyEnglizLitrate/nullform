import { afterEach, describe, expect, it, vi } from "vitest"
import { call, signUp } from "./helpers.js"

const realKey = process.env.SUPABASE_SECRET_KEY
afterEach(() => {
  process.env.SUPABASE_SECRET_KEY = realKey
  vi.doUnmock("../server/db.js")
  vi.resetModules()
  vi.restoreAllMocks()
})

/** Loads the handler fresh, so the memoised service client is rebuilt with whatever key is set now. */
async function registerWith(key: string) {
  process.env.SUPABASE_SECRET_KEY = key
  vi.resetModules()
  return (await import("../server/register.js")).register
}
const token = "eyJhbGciOiJIUzI1NiJ9.e30.not-a-real-signature"
const body = { formId: "00000000-0000-4000-8000-000000000000", commitment: "1" }

/**
 * The hosted gateway answers 401 "Invalid API key" for a key it doesn't know (captured from the real project).
 * The local stack accepts any key-shaped value, so that response is reproduced with a stub client here.
 */
async function registerWithAuthError(error: { status: number; message: string }) {
  vi.resetModules()
  vi.doMock("../server/db.js", () => ({
    db: () => ({ auth: { getUser: async () => ({ data: { user: null }, error: { name: "AuthApiError", ...error } }) } }),
  }))
  return (await import("../server/register.js")).register
}

describe("a broken server key is reported as the server's problem, not as 'unauthenticated'", () => {
  it("a masked key (what the Supabase CLI lists) is refused up front with a clear log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const register = await registerWith("sb_secret_uu_jV··························")
    const r = await call(register, body, token)
    expect(r).toMatchObject({ status: 500, body: { error: "server_misconfigured" } })
    expect(String(log.mock.calls[0]?.[0])).toMatch(/masked copy.*dashboard/i)
  })

  it("a missing key is a server error too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const register = await registerWith("")
    expect(await call(register, body, token)).toMatchObject({ status: 500, body: { error: "server_misconfigured" } })
  })

  it("a good key with a bad user token is still the caller's problem (401)", async () => {
    const register = await registerWith(realKey!)
    expect(await call(register, body, token)).toMatchObject({ status: 401, body: { error: "unauthenticated" } })
    expect(await call(register, body)).toMatchObject({ status: 401 }) // no token at all
  })

  it("a good key with a real user token works as before", async () => {
    const register = await registerWith(realKey!)
    const u = await signUp()
    // A non-existent form: reaching "form_not_found" proves the token was accepted and the key works.
    expect(await call(register, body, u.token)).toMatchObject({ status: 404, body: { error: "form_not_found" } })
  })

  it("hosted 'Invalid API key' (401) while validating a user is a server error with a clear log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const register = await registerWithAuthError({ status: 401, message: "Invalid API key" })
    expect(await call(register, body, token)).toMatchObject({ status: 500, body: { error: "server_misconfigured" } })
    expect(String(log.mock.calls[0]?.[0])).toMatch(/rejected SUPABASE_SECRET_KEY/)
  })

  it("an invalid user token (hosted wording) is still the caller's problem", async () => {
    const register = await registerWithAuthError({ status: 401, message: "invalid JWT: unable to parse or verify signature" })
    expect(await call(register, body, token)).toMatchObject({ status: 401, body: { error: "unauthenticated" } })
  })

  it("a Supabase Auth outage is reported as unavailable (503), not as the caller's fault", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const register = await registerWithAuthError({ status: 502, message: "bad gateway" })
    expect(await call(register, body, token)).toMatchObject({ status: 503, body: { error: "auth_unavailable" } })
  })
})

describe("database errors", () => {
  it("a rejected key from the database layer is a server error, other unknown errors stay generic", async () => {
    const { sqlError } = await import("../server/http.js")
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(sqlError("Invalid API key")).toMatchObject({ status: 500, code: "server_misconfigured" })
    expect(sqlError("something unexpected")).toMatchObject({ status: 500, code: "internal_error" })
    expect(sqlError("already_submitted")).toMatchObject({ status: 409, code: "already_submitted" })
    expect(log).toHaveBeenCalledTimes(2)
  })
})
