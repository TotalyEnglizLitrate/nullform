import { Identity } from "@semaphore-protocol/identity"
import { verifyProof } from "@semaphore-protocol/proof"
import { describe, expect, it } from "vitest"
import { checkBinding, checkGroup, computeRoot, explorerTx, type Receipt } from "../src/lib/audit.js"
import { scopeFromFormId, signalFromPayload } from "../shared/hash.js"
import { makeProof } from "./helpers.js"

const FORM = "33333333-3333-4333-8333-333333333333"
const ids = Array.from({ length: 5 }, () => new Identity())
const leaves = ids.map((i) => i.commitment.toString())

describe("group checks", () => {
  const root = computeRoot(leaves)
  const form = { root, leaf_count: 5 }
  it("passes for an honest group, regardless of leaf order", () => {
    expect(checkGroup(form, leaves).every((c) => c.ok)).toBe(true)
    expect(checkGroup(form, [...leaves].reverse()).every((c) => c.ok)).toBe(true)
  })
  it("fails when a leaf is added, removed or swapped", () => {
    const extra = new Identity().commitment.toString()
    for (const tampered of [[...leaves, extra], leaves.slice(1), [extra, ...leaves.slice(1)]]) {
      const bad = checkGroup(form, tampered).filter((c) => !c.ok).map((c) => c.name)
      expect(bad).toContain("Rebuilt root equals the published root")
    }
  })
  it("flags a wrong published count, duplicates and junk", () => {
    expect(checkGroup({ root, leaf_count: 4 }, leaves).some((c) => !c.ok)).toBe(true)
    expect(checkGroup(form, [...leaves, leaves[0]!]).some((c) => c.name.includes("twice") && !c.ok)).toBe(true)
    expect(checkGroup(form, ["abc"]).some((c) => !c.ok)).toBe(true)
  })
})

describe("receipt binding and proof verification (real proof)", () => {
  const payload = { q1: "o1" }
  it("accepts a genuine receipt and rejects each kind of tampering", async () => {
    const root = computeRoot(leaves)
    const form = { id: FORM, root, merkle_depth: 10 }
    const proof = await makeProof(ids[0]!, leaves, payload, FORM)
    const receipt: Receipt = { nullifier: proof.nullifier, signal: await signalFromPayload(payload), proof, submitted_hour: "" }
    expect(await verifyProof(proof)).toBe(true)
    expect(await checkBinding(form, receipt)).toBeNull()

    expect(await checkBinding({ ...form, root: "1" }, receipt)).toMatch(/root/)
    expect(await checkBinding({ ...form, merkle_depth: 9 }, receipt)).toMatch(/depth/)
    expect(await checkBinding({ ...form, id: "44444444-4444-4444-8444-444444444444" }, receipt)).toMatch(/form/)
    expect(await checkBinding(form, { ...receipt, signal: "1" })).toMatch(/signal/)
    expect(await checkBinding(form, { ...receipt, nullifier: "1" })).toMatch(/nullifier/)
    expect(await verifyProof({ ...proof, message: "1" })).toBe(false)
    expect(await scopeFromFormId(FORM)).toBe(proof.scope)
  })
})

describe("explorer links", () => {
  it("builds known chains only", () => {
    expect(explorerTx("sepolia", "0xabc")).toBe("https://sepolia.etherscan.io/tx/0xabc")
    expect(explorerTx("sepolia", null)).toBeNull()
    expect(explorerTx("unknown", "0xabc")).toBeNull()
  })
})
