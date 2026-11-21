import { Identity } from "@semaphore-protocol/identity"
import { verifyProof } from "@semaphore-protocol/proof"
import { describe, expect, it } from "vitest"
import { encodeAnchorData } from "../shared/anchor.js"
import { checkAnchor, checkBinding, checkGroup, computeRoot, duplicateNullifiers, explorerTx, type Receipt } from "../src/lib/audit.js"
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

describe("anchor checks", () => {
  const root = computeRoot(leaves)
  const form = { id: FORM, root }
  const wallet = "0xAbCdEf0000000000000000000000000000000001"
  const tx = (o: object = {}) => ({ from: wallet, to: wallet.toLowerCase(), input: encodeAnchorData(FORM, root),
    blockNumber: "0x10", timestamp: 1_700_000_000, ...o })
  const failing = (t: ReturnType<typeof tx> | null, sender?: string) => checkAnchor(form, t, sender).filter((c) => !c.ok).map((c) => c.name)

  it("passes for a genuine anchor", () => {
    expect(failing(tx())).toEqual([])
    expect(failing(tx(), wallet.toLowerCase())).toEqual([])
  })
  it("fails for a missing, pending, foreign or altered transaction", () => {
    expect(failing(null)).toEqual(["Transaction found on the chain"])
    expect(failing(tx({ blockNumber: null }))).toEqual(["Transaction is confirmed in a block"])
    expect(failing(tx({ input: "0xdeadbeef" }))).toContain("Calldata is a NullForm anchor")
    expect(failing(tx({ input: encodeAnchorData("44444444-4444-4444-8444-444444444444", root) }))).toEqual(["Anchor is for this form"])
    expect(failing(tx({ input: encodeAnchorData(FORM, "1") }))).toEqual(["Anchored root equals the published root"])
    expect(failing(tx({ to: "0x0000000000000000000000000000000000000002" }))).toEqual(["Sent from the wallet to itself"])
    expect(failing(tx(), "0x0000000000000000000000000000000000000009")).toEqual(["Sent by the expected anchor wallet"])
  })
})

describe("double-submission detection on the audit page", () => {
  const r = (nullifier: string) => ({ nullifier })
  it("flags receipts whose nullifiers are the same number, however spelled", () => {
    expect([...duplicateNullifiers([r("5"), r("7"), r("05"), r("9")])].sort()).toEqual([0, 2])
    expect([...duplicateNullifiers([r("5"), r("7"), r("5")])].sort()).toEqual([0, 2])
  })
  it("reports nothing when every nullifier is different", () => {
    expect(duplicateNullifiers([r("1"), r("2"), r("3")]).size).toBe(0)
    expect(duplicateNullifiers([]).size).toBe(0)
  })
  it("treats unparseable nullifiers as their own text instead of crashing", () => {
    expect([...duplicateNullifiers([r("abc"), r("abc"), r("4")])].sort()).toEqual([0, 1])
  })
  it("rejects a receipt whose nullifier is not in canonical form", async () => {
    const proof = await makeProof(ids[0]!, leaves, { q1: "o1" }, FORM)
    const form = { id: FORM, root: computeRoot(leaves), merkle_depth: 10 }
    const padded = "0" + proof.nullifier
    const receipt: Receipt = { nullifier: padded, signal: await signalFromPayload({ q1: "o1" }), proof: { ...proof, nullifier: padded }, submitted_hour: "" }
    expect(await checkBinding(form, receipt)).toMatch(/canonical/)
  })
})

describe("explorer links", () => {
  it("builds known chains only", () => {
    expect(explorerTx("sepolia", "0xabc")).toBe("https://sepolia.etherscan.io/tx/0xabc")
    expect(explorerTx("sepolia", null)).toBeNull()
    expect(explorerTx("unknown", "0xabc")).toBeNull()
  })
})
