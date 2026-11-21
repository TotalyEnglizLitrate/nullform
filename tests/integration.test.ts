import { beforeAll, describe, expect, it } from "vitest"
import { Group } from "@semaphore-protocol/group"
import { Identity } from "@semaphore-protocol/identity"
import { lifecycle } from "../server/lifecycle.js"
import { register } from "../server/register.js"
import { submit } from "../server/submit.js"
import { sortLeaves } from "../shared/leaves.js"
import {
  admin, anonClient, call, createForm, makeProof, publicLeaves, signUp, type TestUser,
} from "./helpers.js"

let owner: TestUser
let outsider: TestUser
beforeAll(async () => {
  ;[owner, outsider] = await Promise.all([signUp(), signUp()])
})

const answers = { color: "red", note: "hello", score: 4 }

/** Creates a form, registers `n` members through the real API, opens and freezes it. */
async function frozenForm(n: number, o: { opensAt?: Date } = {}) {
  const members = await Promise.all(Array.from({ length: n }, () => signUp()))
  const formId = await createForm(owner, { allowlist: members.map((m) => m.email), ...o })
  expect((await call(lifecycle, { formId, action: "open" }, owner.token)).status).toBe(200)
  const identities = members.map(() => new Identity())
  for (const [i, m] of members.entries()) {
    const r = await call(register, { formId, commitment: identities[i]!.commitment.toString() }, m.token)
    expect(r.body).toEqual({ ok: true })
  }
  const frozen = await call(lifecycle, { formId, action: "freeze" }, owner.token)
  expect(frozen.status).toBe(200)
  return { formId, members, identities, frozen: frozen.body }
}

describe("full flow", () => {
  it("registers, freezes with a sorted root, accepts a proof, keeps answers private", async () => {
    const { formId, members, identities, frozen } = await frozenForm(3)
    const leaves = await publicLeaves(formId)
    expect(leaves).toHaveLength(3)
    // Anyone can rebuild the same root from the public leaves (the audit-page check).
    expect(new Group(sortLeaves(leaves)).root.toString()).toBe(frozen.root)
    expect(frozen.smallGroupWarning).toBe(true) // 3 < default 20

    const proof = await makeProof(identities[0]!, leaves, answers, formId)
    const res = await call(submit, { formId, payload: answers, proof }) // no auth header
    expect(res.status).toBe(200)

    // Public receipt, no answers.
    const receipts = await anonClient().from("receipts").select("*").eq("form_id", formId)
    expect(receipts.data).toHaveLength(1)
    expect(receipts.data![0]!.nullifier).toBe(proof.nullifier)
    expect(JSON.stringify(receipts.data)).not.toContain("hello")
    expect((await anonClient().from("answers").select("*")).error).not.toBeNull()

    // Answers: owner yes, other users no.
    expect((await owner.client.from("answers").select("*").eq("form_id", formId)).data).toHaveLength(1)
    expect((await outsider.client.from("answers").select("*").eq("form_id", formId)).data).toEqual([])
    expect((await members[1]!.client.from("answers").select("*").eq("form_id", formId)).data).toEqual([])
  })

  it("rejects a second submission from the same member (nullifier reuse)", async () => {
    const { formId, identities } = await frozenForm(2)
    const leaves = await publicLeaves(formId)
    const first = await makeProof(identities[0]!, leaves, answers, formId)
    expect((await call(submit, { formId, payload: answers, proof: first })).status).toBe(200)
    const other = { color: "blue" }
    const second = await makeProof(identities[0]!, leaves, other, formId)
    const res = await call(submit, { formId, payload: other, proof: second })
    expect(res).toMatchObject({ status: 409, body: { error: "already_submitted" } })
  })

  it("rejects a tampered payload", async () => {
    const { formId, identities } = await frozenForm(2)
    const proof = await makeProof(identities[0]!, await publicLeaves(formId), answers, formId)
    const res = await call(submit, { formId, payload: { ...answers, color: "blue" }, proof })
    expect(res).toMatchObject({ status: 400, body: { error: "signal_mismatch" } })
  })

  it("rejects a proof from a non-member (unregistered commitment)", async () => {
    const { formId } = await frozenForm(2)
    const stranger = new Identity()
    const leaves = [...(await publicLeaves(formId)), stranger.commitment.toString()]
    const proof = await makeProof(stranger, leaves, answers, formId)
    const res = await call(submit, { formId, payload: answers, proof })
    expect(res).toMatchObject({ status: 400, body: { error: "wrong_root" } })
  })

  it("rejects a proof made for another form (scope)", async () => {
    const a = await frozenForm(2)
    const b = await frozenForm(2)
    const proof = await makeProof(a.identities[0]!, await publicLeaves(a.formId), answers, a.formId)
    const res = await call(submit, { formId: b.formId, payload: answers, proof })
    expect(res.status).toBe(400) // root differs (and scope would too)
  })

  it("rejects a forged proof with a valid-looking shape", async () => {
    const { formId, identities } = await frozenForm(2)
    const proof = await makeProof(identities[0]!, await publicLeaves(formId), answers, formId)
    const points = [...proof.points] as string[]
    points[0] = "1"
    const res = await call(submit, { formId, payload: answers, proof: { ...proof, points } })
    expect(res).toMatchObject({ status: 400, body: { error: "invalid_proof" } })
  })

  it("rejects payloads that violate the schema", async () => {
    const { formId, identities } = await frozenForm(2)
    const leaves = await publicLeaves(formId)
    for (const payload of [{}, { color: "green" }, { color: "red", score: 9 }, { color: "red", extra: 1 }]) {
      const proof = await makeProof(identities[0]!, leaves, payload, formId)
      expect(await call(submit, { formId, payload, proof })).toMatchObject({ status: 400, body: { error: "invalid_payload" } })
    }
  })
})

describe("lifecycle gates", () => {
  it("refuses submissions before the form opens", async () => {
    const { formId, identities } = await frozenForm(2, { opensAt: new Date(Date.now() + 3_600_000) })
    const proof = await makeProof(identities[0]!, await publicLeaves(formId), answers, formId)
    expect(await call(submit, { formId, payload: answers, proof })).toMatchObject({ status: 403, body: { error: "submissions_closed" } })
  })

  it("refuses submissions after the form is closed", async () => {
    const { formId, identities } = await frozenForm(2)
    const proof = await makeProof(identities[0]!, await publicLeaves(formId), answers, formId)
    expect((await call(lifecycle, { formId, action: "close" }, owner.token)).status).toBe(200)
    expect(await call(submit, { formId, payload: answers, proof })).toMatchObject({ status: 403 })
  })

  it("refuses registration before opening, after freezing, and freezing twice", async () => {
    const late = await signUp()
    const formId = await createForm(owner, { allowlist: [late.email] })
    const c = new Identity().commitment.toString()
    expect(await call(register, { formId, commitment: c }, late.token)).toMatchObject({ status: 409, body: { error: "registration_closed" } })
    await call(lifecycle, { formId, action: "open" }, owner.token)
    await call(register, { formId, commitment: c }, late.token)
    await call(lifecycle, { formId, action: "freeze" }, owner.token)
    const alsoLate = await signUp()
    await admin().from("form_allowlist").insert({ form_id: formId, entry: alsoLate.email })
    expect(await call(register, { formId, commitment: new Identity().commitment.toString() }, alsoLate.token))
      .toMatchObject({ status: 409, body: { error: "registration_closed" } })
    expect(await call(lifecycle, { formId, action: "freeze" }, owner.token)).toMatchObject({ status: 409 })
  })

  it("refuses to freeze an empty group", async () => {
    const formId = await createForm(owner, { allowlist: ["x@test.local"] })
    await call(lifecycle, { formId, action: "open" }, owner.token)
    expect(await call(lifecycle, { formId, action: "freeze" }, owner.token)).toMatchObject({ status: 409, body: { error: "empty_group" } })
  })

  it("refuses to open an invalid form (empty allowlist, bad schema)", async () => {
    const formId = await createForm(owner)
    const r = await call(lifecycle, { formId, action: "open" }, owner.token)
    expect(r.status).toBe(400)
    expect(r.body.problems).toContain("allowlist is empty")
  })

  it("only the owner can run lifecycle actions", async () => {
    const formId = await createForm(owner, { allowlist: ["x@test.local"] })
    expect(await call(lifecycle, { formId, action: "open" }, outsider.token)).toMatchObject({ status: 404 })
    expect(await call(lifecycle, { formId, action: "open" })).toMatchObject({ status: 401 })
  })

  it("locks the schema once registration opens", async () => {
    const formId = await createForm(owner, { allowlist: ["x@test.local"] })
    await call(lifecycle, { formId, action: "open" }, owner.token)
    const r = await owner.client.from("forms").update({ title: "changed" }).eq("id", formId).select()
    expect(r.data).toEqual([]) // RLS: no longer a draft, so no row is updatable
    const hash = (await admin().from("forms").select("schema_hash").eq("id", formId).single()).data!.schema_hash
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("registration eligibility", () => {
  async function openForm(o: Parameters<typeof createForm>[1]) {
    const formId = await createForm(owner, o)
    expect((await call(lifecycle, { formId, action: "open" }, owner.token)).status).toBe(200)
    return formId
  }
  const commit = () => new Identity().commitment.toString()

  it("enforces the allowlist and one registration per user", async () => {
    const yes = await signUp()
    const formId = await openForm({ allowlist: [yes.email] })
    expect(await call(register, { formId, commitment: commit() }, outsider.token)).toMatchObject({ status: 403, body: { error: "not_eligible" } })
    expect((await call(register, { formId, commitment: commit() }, yes.token)).status).toBe(200)
    expect(await call(register, { formId, commitment: commit() }, yes.token)).toMatchObject({ status: 409, body: { error: "already_registered" } })
  })

  it("rejects a reused commitment", async () => {
    const a = await signUp(), b = await signUp()
    const formId = await openForm({ allowlist: [a.email, b.email] })
    const c = commit()
    await call(register, { formId, commitment: c }, a.token)
    expect(await call(register, { formId, commitment: c }, b.token)).toMatchObject({ status: 409, body: { error: "commitment_taken" } })
  })

  it("normalizes +tags when the owner opts in: one person, one registration", async () => {
    const stamp = Date.now()
    const a = await signUp(`dup${stamp}+one@test.local`)
    const b = await signUp(`dup${stamp}+two@test.local`)
    const formId = await openForm({
      eligibility: { mode: "allowlist", stripPlusTag: true },
      allowlist: [`dup${stamp}@test.local`],
    })
    expect((await call(register, { formId, commitment: commit() }, a.token)).status).toBe(200)
    expect(await call(register, { formId, commitment: commit() }, b.token)).toMatchObject({ status: 409, body: { error: "already_registered" } })
  })

  it("matches by domain, exactly", async () => {
    const formId = await openForm({ eligibility: { mode: "domain" }, allowlist: ["test.local"] })
    expect((await call(register, { formId, commitment: commit() }, outsider.token)).status).toBe(200)
    const other = await openForm({ eligibility: { mode: "domain" }, allowlist: ["example.com"] })
    expect((await call(register, { formId: other, commitment: commit() }, (await signUp()).token)).status).toBe(403)
  })

  it("accepts any verified address in 'any' mode", async () => {
    const formId = await openForm({ eligibility: { mode: "any" } })
    expect((await call(register, { formId, commitment: commit() }, (await signUp()).token)).status).toBe(200)
  })

  it("validates input and auth", async () => {
    const formId = await openForm({ eligibility: { mode: "any" } })
    expect(await call(register, { formId, commitment: "1" })).toMatchObject({ status: 401 })
    expect(await call(register, { formId, commitment: "abc" }, outsider.token)).toMatchObject({ status: 400 })
    expect(await call(register, { formId: "nope", commitment: commit() }, outsider.token)).toMatchObject({ status: 400 })
    expect(await call(register, { formId: crypto.randomUUID(), commitment: commit() }, outsider.token)).toMatchObject({ status: 404 })
  })

  it("stores no link between a user and a commitment", async () => {
    const formId = await openForm({ eligibility: { mode: "any" } })
    await call(register, { formId, commitment: commit() }, outsider.token)
    const cols = await admin().from("commitments").select("*").eq("form_id", formId).limit(1)
    expect(Object.keys(cols.data![0]!).sort()).toEqual(["commitment", "form_id"])
  })
})

describe("row level security (anon and user keys)", () => {
  it("anon cannot read drafts, write forms, or call server functions", async () => {
    const formId = await createForm(owner)
    const anon = anonClient()
    expect((await anon.from("forms").select("*").eq("id", formId)).data).toEqual([])
    expect((await anon.from("forms").insert({ owner_id: owner.id, title: "x", schema: {}, eligibility: {} })).error).not.toBeNull()
    for (const fn of ["register_member", "submit_answers", "begin_freeze", "open_registration"])
      expect((await anon.rpc(fn, {})).error).not.toBeNull()
    expect((await owner.client.rpc("register_member", {
      p_form: formId, p_user: owner.id, p_subject: "x", p_commitment: "1" })).error).not.toBeNull()
  })

  it("nobody can write registrations, commitments, receipts or answers directly", async () => {
    const formId = await createForm(owner)
    for (const t of ["registrations", "commitments", "receipts", "answers"]) {
      expect((await owner.client.from(t).insert({ form_id: formId })).error).not.toBeNull()
      expect((await anonClient().from(t).insert({ form_id: formId })).error).not.toBeNull()
    }
  })

  it("registrations are private to the user; allowlist is private to the owner", async () => {
    const m = await signUp()
    const formId = await createForm(owner, { allowlist: [m.email] })
    await call(lifecycle, { formId, action: "open" }, owner.token)
    await call(register, { formId, commitment: new Identity().commitment.toString() }, m.token)
    expect((await m.client.from("registrations").select("*")).data).toHaveLength(1)
    expect((await outsider.client.from("registrations").select("*").eq("form_id", formId)).data).toEqual([])
    expect((await owner.client.from("registrations").select("*").eq("form_id", formId)).data).toEqual([])
    expect((await m.client.from("form_allowlist").select("*").eq("form_id", formId)).data).toEqual([])
    expect((await owner.client.from("form_allowlist").select("*").eq("form_id", formId)).data).toHaveLength(1)
  })

  it("commitments are hidden until the group is frozen", async () => {
    const m = await signUp()
    const formId = await createForm(owner, { allowlist: [m.email] })
    await call(lifecycle, { formId, action: "open" }, owner.token)
    await call(register, { formId, commitment: new Identity().commitment.toString() }, m.token)
    expect((await anonClient().from("commitments").select("*").eq("form_id", formId)).data).toEqual([])
    await call(lifecycle, { formId, action: "freeze" }, owner.token)
    expect((await anonClient().from("commitments").select("*").eq("form_id", formId)).data).toHaveLength(1)
  })

  it("other users cannot edit or delete someone else's form", async () => {
    const formId = await createForm(owner)
    expect((await outsider.client.from("forms").update({ title: "pwned" }).eq("id", formId).select()).data).toEqual([])
    expect((await outsider.client.from("forms").delete().eq("id", formId).select()).data).toEqual([])
    expect((await outsider.client.from("form_allowlist").insert({ form_id: formId, entry: "a@b.c" })).error).not.toBeNull()
  })

  it("owners cannot forge lifecycle fields", async () => {
    const r = await owner.client.from("forms").insert({
      owner_id: owner.id, title: "x", schema: {}, eligibility: {}, root: "1", status: "frozen" })
    expect(r.error).not.toBeNull()
  })
})
