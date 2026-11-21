import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { Group } from "@semaphore-protocol/group"
import { Identity } from "@semaphore-protocol/identity"
import { generateProof } from "@semaphore-protocol/proof"
import { db } from "../server/db.js"
import { scopeFromFormId, signalFromPayload } from "../shared/hash.js"
import { sortLeaves } from "../shared/leaves.js"
import type { Eligibility } from "../server/providers/index.js"
import type { FormSchema } from "../shared/schema.js"

const env = (k: string) => process.env[k]!
const artifact = (f: string) => fileURLToPath(new URL(`../public/artifacts/${f}`, import.meta.url))

export const anonClient = () =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_PUBLISHABLE_KEY"), { auth: { persistSession: false } })

export interface TestUser {
  email: string
  token: string
  id: string
  /** Client acting as this user (RLS applies). */
  client: SupabaseClient
}

async function otpFromMailpit(email: string): Promise<string> {
  const base = env("MAILPIT_URL")
  for (let i = 0; i < 50; i++) {
    const list = await (await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()
    const id = list.messages?.[0]?.ID
    if (id) {
      const msg = await (await fetch(`${base}/api/v1/message/${id}`)).json()
      const m = /\b(\d{6})\b/.exec(msg.Text ?? "")
      if (m) return m[1]!
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`no OTP email for ${email}`)
}

/** Real email one-time-code sign-in against local Auth, reading the code from the mail catcher. */
export async function signUp(email = `${randomUUID()}@test.local`): Promise<TestUser> {
  const anon = anonClient()
  const sent = await anon.auth.signInWithOtp({ email })
  if (sent.error) throw sent.error
  const code = await otpFromMailpit(email)
  const { data, error } = await anon.auth.verifyOtp({ email, token: code, type: "email" })
  if (error || !data.session) throw error ?? new Error("no session")
  const token = data.session.access_token
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  return { email, token, id: data.session.user.id, client }
}

export const testSchema: FormSchema = {
  questions: [
    { id: "color", type: "single", label: "Color", required: true, options: [{ id: "red", label: "Red" }, { id: "blue", label: "Blue" }] },
    { id: "note", type: "text", label: "Note", required: false, maxLength: 50 },
    { id: "score", type: "rating", label: "Score", required: false },
  ],
}

export async function createForm(
  owner: TestUser,
  o: { eligibility?: Eligibility; allowlist?: string[]; opensAt?: Date; minGroupSize?: number } = {},
): Promise<string> {
  const { data, error } = await owner.client
    .from("forms")
    .insert({
      owner_id: owner.id,
      title: "Test form",
      schema: testSchema,
      eligibility: o.eligibility ?? { mode: "allowlist" },
      opens_at: (o.opensAt ?? new Date(Date.now() - 60_000)).toISOString(),
      ...(o.minGroupSize ? { min_group_size: o.minGroupSize } : {}),
    })
    .select("id")
    .single()
  if (error) throw error
  if (o.allowlist?.length) {
    const r = await owner.client.from("form_allowlist").insert(o.allowlist.map((entry) => ({ form_id: data.id, entry })))
    if (r.error) throw r.error
  }
  return data.id as string
}

export async function call(
  fn: (req: Request) => Promise<Response>,
  body: unknown,
  token?: string,
): Promise<{ status: number; body: any }> {
  const res = await fn(
    new Request("http://test/api", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: await res.json() }
}

/** Builds a real Semaphore proof from the public leaf list, exactly as a browser would. */
export async function makeProof(identity: Identity, leaves: string[], payload: unknown, formId: string) {
  const group = new Group(sortLeaves(leaves))
  return generateProof(identity, group, await signalFromPayload(payload), await scopeFromFormId(formId), 10, {
    wasm: artifact("semaphore-10.wasm"),
    zkey: artifact("semaphore-10.zkey"),
  })
}

/** What the public sees after a freeze: the leaf list. */
export async function publicLeaves(formId: string): Promise<string[]> {
  const { data, error } = await anonClient().from("commitments").select("commitment").eq("form_id", formId)
  if (error) throw error
  return (data ?? []).map((r) => r.commitment as string)
}

export const admin = db
