import { describe, expect, it } from "vitest"
import { Identity } from "@semaphore-protocol/identity"
import { lifecycle } from "../server/lifecycle.js"
import { register } from "../server/register.js"
import { submit } from "../server/submit.js"
import { FIELD } from "../shared/leaves.js"
import { admin, anonClient, call, createForm, makeProof, publicLeaves, signUp } from "./helpers.js"

/**
 * The proof verifier reads "07" and "7" as the same number. If the server keyed on the raw string, a member could
 * answer twice by writing their nullifier with a leading zero. These tests run that attack for real.
 */
async function frozenForm() {
  const owner = await signUp(), member = await signUp()
  const formId = await createForm(owner, { allowlist: [member.email] })
  await call(lifecycle, { formId, action: "open" }, owner.token)
  const identity = new Identity()
  expect((await call(register, { formId, commitment: identity.commitment.toString() }, member.token)).status).toBe(200)
  expect((await call(lifecycle, { formId, action: "freeze" }, owner.token)).status).toBe(200)
  return { formId, identity, leaves: await publicLeaves(formId) }
}
const answersA = { color: "red" }
const answersB = { color: "blue" } // different answers, same member: the proof differs but the nullifier is the same

describe("a member cannot answer twice by respelling the nullifier", () => {
  it("rejects leading zeros, extra zeros and N + field order; only the canonical spelling is accepted", async () => {
    const { formId, identity, leaves } = await frozenForm()
    const first = await makeProof(identity, leaves, answersA, formId)
    const N = first.nullifier
    expect((await call(submit, { formId, payload: answersA, proof: first })).status).toBe(200)

    const second = await makeProof(identity, leaves, answersB, formId)
    expect(second.nullifier).toBe(N) // same member, same form: same nullifier, as the protocol intends
    for (const spelling of ["0" + N, "00" + N, (BigInt(N) + FIELD).toString()]) {
      const r = await call(submit, { formId, payload: answersB, proof: { ...second, nullifier: spelling } })
      expect(r, `spelling ${spelling.slice(0, 6)}…`).toMatchObject({ status: 400, body: { error: "invalid_proof" } })
    }
    // the canonical spelling is recognised as the repeat it is
    expect(await call(submit, { formId, payload: answersB, proof: second })).toMatchObject({ status: 409, body: { error: "already_submitted" } })

    const stored = await anonClient().from("receipts").select("nullifier").eq("form_id", formId)
    expect(stored.data).toEqual([{ nullifier: N }]) // exactly one receipt, however many attempts
  })

  it("rejects non-canonical roots and proof points too", async () => {
    const { formId, identity, leaves } = await frozenForm()
    const proof = await makeProof(identity, leaves, answersA, formId)
    for (const bad of [{ merkleTreeRoot: "0" + proof.merkleTreeRoot }, { points: ["0" + proof.points[0], ...proof.points.slice(1)] }, { message: "0" + proof.message }]) {
      expect(await call(submit, { formId, payload: answersA, proof: { ...proof, ...bad } })).toMatchObject({ status: 400 })
    }
  })
})

describe("the database refuses non-canonical numbers even if the server were bypassed", () => {
  it("rejects a leading-zero nullifier or signal in the submit function", async () => {
    const { formId, identity, leaves } = await frozenForm()
    const proof = await makeProof(identity, leaves, answersA, formId)
    for (const args of [{ p_nullifier: "0" + proof.nullifier, p_signal: proof.message }, { p_nullifier: proof.nullifier, p_signal: "0" + proof.message }]) {
      const r = await admin().rpc("submit_answers", { p_form: formId, p_proof: proof, p_payload: answersA, ...args })
      expect(r.error?.message ?? "").toMatch(/canonical/)
    }
  })

  it("rejects a leading-zero commitment in the register function", async () => {
    const owner = await signUp(), member = await signUp()
    const formId = await createForm(owner, { allowlist: [member.email] })
    await call(lifecycle, { formId, action: "open" }, owner.token)
    const c = new Identity().commitment.toString()
    const r = await admin().rpc("register_member", { p_form: formId, p_user: member.id, p_subject: "x", p_commitment: "0" + c })
    expect(r.error?.message ?? "").toMatch(/canonical/)
  })
})

describe("registration only takes canonical commitments", () => {
  it("rejects a leading-zero spelling of a valid commitment at the API", async () => {
    const owner = await signUp(), member = await signUp()
    const formId = await createForm(owner, { allowlist: [member.email] })
    await call(lifecycle, { formId, action: "open" }, owner.token)
    const c = new Identity().commitment.toString()
    expect(await call(register, { formId, commitment: "0" + c }, member.token)).toMatchObject({ status: 400, body: { error: "invalid_commitment" } })
    expect((await call(register, { formId, commitment: c }, member.token)).status).toBe(200)
  })
})
