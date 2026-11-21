import { execFileSync } from "node:child_process"
import { afterEach, describe, expect, it } from "vitest"
import { Identity } from "@semaphore-protocol/identity"
import { setAnchorer } from "../server/anchor.js"
import { lifecycle } from "../server/lifecycle.js"
import { register } from "../server/register.js"
import { ANCHOR_COLUMNS, anchorsJson, toAnchorRecords, type AnchorRow } from "../shared/anchors.js"
import { anonClient, call, createForm, signUp } from "./helpers.js"

const row = (o: Partial<AnchorRow> = {}): AnchorRow => ({
  id: "b0000000-0000-4000-8000-000000000000", root: "123", leaf_count: 3, schema_hash: "ab".repeat(32),
  merkle_depth: 10, anchor_chain: "sepolia", anchor_tx: "0x" + "1".repeat(64), ...o,
})

describe("anchors list (pure)", () => {
  it("maps database rows to the public record shape", () => {
    expect(toAnchorRecords([row()])).toEqual([{
      formId: "b0000000-0000-4000-8000-000000000000", root: "123", leafCount: 3, schemaHash: "ab".repeat(32),
      merkleDepth: 10, chain: "sepolia", tx: "0x" + "1".repeat(64),
    }])
  })
  it("keeps only fully anchored forms", () => {
    expect(toAnchorRecords([row({ anchor_tx: null }), row({ anchor_chain: null }), row({ root: null })])).toEqual([])
  })
  it("sorts by form id so exports diff cleanly", () => {
    const ids = toAnchorRecords([row({ id: "c" }), row({ id: "a" }), row({ id: "b" })]).map((r) => r.formId)
    expect(ids).toEqual(["a", "b", "c"])
  })
  it("writes a stable JSON file; an empty list is [] with a trailing newline", () => {
    expect(anchorsJson([])).toBe("[]\n")
    expect(anchorsJson(toAnchorRecords([row()])).endsWith("}\n]\n")).toBe(true)
  })
})

describe("anyone can read the anchors with only the public key", () => {
  afterEach(() => setAnchorer(undefined))

  it("an anchored form appears; drafts and unanchored forms do not; the command-line script writes the identical file", async () => {
    const tx = "0x" + "a".repeat(64)
    setAnchorer({ chain: "sepolia", anchor: async () => tx })
    const owner = await signUp(), member = await signUp()
    const formId = await createForm(owner, { allowlist: [member.email] })
    const draftId = await createForm(owner, { allowlist: [member.email] }) // stays a draft
    await call(lifecycle, { formId, action: "open" }, owner.token)
    await call(register, { formId, commitment: new Identity().commitment.toString() }, member.token)
    const frozen = await call(lifecycle, { formId, action: "freeze" }, owner.token)
    expect(frozen.body.anchored).toBe(true)

    // exactly what the app's page does: the public key, no sign-in
    const { data, error } = await anonClient().from("forms").select(ANCHOR_COLUMNS).not("anchor_tx", "is", null).order("id").limit(1000)
    expect(error).toBeNull()
    const records = toAnchorRecords(data as unknown as AnchorRow[])
    const mine = records.find((r) => r.formId === formId)
    expect(mine).toMatchObject({ root: frozen.body.root, leafCount: 1, merkleDepth: 10, chain: "sepolia", tx })
    expect(mine?.schemaHash).toMatch(/^[0-9a-f]{64}$/)
    expect(records.some((r) => r.formId === draftId)).toBe(false)

    // the command-line script reads the same public data and must produce byte-identical output
    const out = execFileSync(process.execPath, ["scripts/export-anchors.mjs"], {
      env: { ...process.env, SUPABASE_URL: process.env.SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY! },
      encoding: "utf8",
    })
    expect(out).toBe(anchorsJson(records))
  })
})
