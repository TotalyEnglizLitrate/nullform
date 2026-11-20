import { describe, expect, it } from "vitest"
import { decodeBackup, deriveIdentity, encodeBackup, newMaster } from "../src/lib/identity.js"

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"

describe("per-form identity derivation", () => {
  it("is deterministic for the same master and form", async () => {
    const m = newMaster()
    expect((await deriveIdentity(m, A)).commitment).toBe((await deriveIdentity(m, A)).commitment)
  })
  it("differs across forms, so commitments are not linkable", async () => {
    const m = newMaster()
    expect((await deriveIdentity(m, A)).commitment).not.toBe((await deriveIdentity(m, B)).commitment)
  })
  it("differs across masters", async () => {
    expect((await deriveIdentity(newMaster(), A)).commitment).not.toBe((await deriveIdentity(newMaster(), A)).commitment)
  })
  it("rejects a wrong-length master", async () => {
    await expect(deriveIdentity(new Uint8Array(16), A)).rejects.toThrow()
  })
})

describe("backup string", () => {
  it("round-trips and restores the same identities", async () => {
    const m = newMaster()
    const restored = await decodeBackup(await encodeBackup(m))
    expect(restored).toEqual(m)
    expect((await deriveIdentity(restored, A)).commitment).toBe((await deriveIdentity(m, A)).commitment)
  })
  it("rejects typos, truncation and junk", async () => {
    const s = await encodeBackup(newMaster())
    const typo = s.slice(0, 10) + (s[10] === "a" ? "b" : "a") + s.slice(11)
    await expect(decodeBackup(typo)).rejects.toThrow()
    await expect(decodeBackup(s.slice(0, -2))).rejects.toThrow()
    await expect(decodeBackup("hello")).rejects.toThrow()
  })
  it("tolerates surrounding whitespace", async () => {
    const m = newMaster()
    expect(await decodeBackup(`  ${await encodeBackup(m)}\n`)).toEqual(m)
  })
})
