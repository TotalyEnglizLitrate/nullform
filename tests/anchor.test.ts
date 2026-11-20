import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { Identity } from "@semaphore-protocol/identity"
import { setAnchorer, type Anchorer } from "../server/anchor.js"
import { lifecycle } from "../server/lifecycle.js"
import { register } from "../server/register.js"
import { decodeAnchorData } from "../shared/anchor.js"
import { admin, anonClient, call, createForm, signUp, type TestUser } from "./helpers.js"

let owner: TestUser
let stranger: TestUser
beforeAll(async () => { ;[owner, stranger] = await Promise.all([signUp(), signUp()]) })
afterEach(() => setAnchorer(undefined))

const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`
function fake(behaviour: "ok" | "fail" | "badhash" = "ok") {
  const calls: { formId: string; root: string }[] = []
  const a: Anchorer = {
    chain: "sepolia",
    async anchor(formId, root) {
      calls.push({ formId, root })
      if (behaviour === "fail") throw new Error("rpc down")
      return behaviour === "badhash" ? "not-a-hash" : hash(calls.length)
    },
  }
  return { a, calls }
}

/** A form with one registered member, ready to freeze. */
async function readyForm() {
  const m = await signUp()
  const formId = await createForm(owner, { allowlist: [m.email] })
  await call(lifecycle, { formId, action: "open" }, owner.token)
  await call(register, { formId, commitment: new Identity().commitment.toString() }, m.token)
  return formId
}
const stored = async (formId: string) =>
  (await anonClient().from("forms").select("anchor_chain,anchor_tx,root").eq("id", formId).single()).data!

describe("anchoring on freeze", () => {
  it("anchors the frozen root and records the transaction publicly", async () => {
    const { a, calls } = fake()
    setAnchorer(a)
    const formId = await readyForm()
    const r = await call(lifecycle, { formId, action: "freeze" }, owner.token)
    expect(r.body).toMatchObject({ ok: true, anchored: true, anchorTx: hash(1) })
    expect(calls).toEqual([{ formId, root: r.body.root }])
    expect(await stored(formId)).toEqual({ anchor_chain: "sepolia", anchor_tx: hash(1), root: r.body.root })
  })

  it("still freezes when the chain is down, then lets the owner retry", async () => {
    setAnchorer(fake("fail").a)
    const formId = await readyForm()
    const r = await call(lifecycle, { formId, action: "freeze" }, owner.token)
    expect(r).toMatchObject({ status: 200, body: { ok: true, anchored: false, anchorProblem: "failed" } })
    expect((await stored(formId)).anchor_tx).toBeNull()
    expect((await stored(formId)).root).toBe(r.body.root) // freeze is final

    const { a, calls } = fake()
    setAnchorer(a)
    const retry = await call(lifecycle, { formId, action: "anchor" }, owner.token)
    expect(retry).toMatchObject({ status: 200, body: { ok: true, anchorTx: hash(1) } })
    expect(calls[0]).toEqual({ formId, root: r.body.root })
    expect((await stored(formId)).anchor_tx).toBe(hash(1))
  })

  it("never anchors twice or overwrites an anchor", async () => {
    const { a, calls } = fake()
    setAnchorer(a)
    const formId = await readyForm()
    await call(lifecycle, { formId, action: "freeze" }, owner.token)
    expect(await call(lifecycle, { formId, action: "anchor" }, owner.token)).toMatchObject({ status: 409, body: { error: "already_anchored" } })
    expect(calls).toHaveLength(1)
    const direct = await admin().rpc("record_anchor", { p_form: formId, p_owner: owner.id, p_chain: "sepolia", p_tx: hash(9) })
    expect(direct.error?.message).toBe("already_anchored")
  })

  it("treats a malformed transaction hash as a failed anchor", async () => {
    setAnchorer(fake("badhash").a)
    const formId = await readyForm()
    const r = await call(lifecycle, { formId, action: "freeze" }, owner.token)
    expect(r.body).toMatchObject({ ok: true, anchored: false })
    expect((await stored(formId)).anchor_tx).toBeNull()
  })

  it("works with anchoring switched off", async () => {
    setAnchorer(null)
    const formId = await readyForm()
    const r = await call(lifecycle, { formId, action: "freeze" }, owner.token)
    expect(r.body).toMatchObject({ ok: true, anchored: false, anchorProblem: "not_configured" })
    expect(await call(lifecycle, { formId, action: "anchor" }, owner.token)).toMatchObject({ status: 503, body: { error: "anchoring_disabled" } })
  })

  it("only the owner can anchor, and only a frozen form", async () => {
    setAnchorer(fake().a)
    const formId = await readyForm()
    expect(await call(lifecycle, { formId, action: "anchor" }, owner.token)).toMatchObject({ status: 409, body: { error: "wrong_status" } })
    await call(lifecycle, { formId, action: "freeze" }, owner.token)
    const other = await readyForm()
    await call(lifecycle, { formId: other, action: "freeze" }, owner.token)
    expect(await call(lifecycle, { formId: other, action: "anchor" }, stranger.token)).toMatchObject({ status: 404 })
  })

  it("record_anchor is not callable with user or anon keys", async () => {
    const formId = await readyForm()
    const args = { p_form: formId, p_owner: owner.id, p_chain: "sepolia", p_tx: hash(1) }
    expect((await anonClient().rpc("record_anchor", args)).error).not.toBeNull()
    expect((await owner.client.rpc("record_anchor", args)).error).not.toBeNull()
  })
})

describe("anchored data on the wire", () => {
  it("what we send decodes back to the frozen form and root", async () => {
    const { a, calls } = fake()
    setAnchorer(a)
    const formId = await readyForm()
    const r = await call(lifecycle, { formId, action: "freeze" }, owner.token)
    const { encodeAnchorData } = await import("../shared/anchor.js")
    expect(decodeAnchorData(encodeAnchorData(calls[0]!.formId, calls[0]!.root))).toEqual({ formId, root: r.body.root })
  })
})
