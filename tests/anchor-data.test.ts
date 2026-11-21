import { describe, expect, it } from "vitest"
import { decodeAnchorData, encodeAnchorData } from "../shared/anchor.js"

const FORM = "0b8f2c1e-4d5a-4e6f-8a7b-9c0d1e2f3a4b"
const ROOT = "20484419864871076248889695620103700070958360513766148129903329916004809489166"

describe("anchor calldata", () => {
  it("has a fixed byte layout (vector)", () => {
    expect(encodeAnchorData(FORM, "1")).toBe(
      "0x4e554c4c46524d31" + "0b8f2c1e4d5a4e6f8a7b9c0d1e2f3a4b" + "0".repeat(63) + "1")
  })
  it("round-trips form id and root", () => {
    expect(decodeAnchorData(encodeAnchorData(FORM, ROOT))).toEqual({ formId: FORM, root: ROOT })
    expect(decodeAnchorData(encodeAnchorData(FORM.toUpperCase(), "0"))).toEqual({ formId: FORM, root: "0" })
  })
  it("is 56 bytes", () => expect(encodeAnchorData(FORM, ROOT)).toHaveLength(2 + 56 * 2))
  it("rejects bad input when encoding", () => {
    expect(() => encodeAnchorData("nope", ROOT)).toThrow()
    expect(() => encodeAnchorData(FORM, "-1")).toThrow()
    expect(() => encodeAnchorData(FORM, "x")).toThrow()
    expect(() => encodeAnchorData(FORM, (2n ** 256n).toString())).toThrow()
  })
  it("ignores anything that isn't a NullForm anchor", () => {
    const good = encodeAnchorData(FORM, ROOT)
    expect(decodeAnchorData("0x")).toBeNull()
    expect(decodeAnchorData(good.slice(0, -2))).toBeNull()
    expect(decodeAnchorData(good + "00")).toBeNull()
    expect(decodeAnchorData("0x4e554c4c46524d32" + good.slice(18))).toBeNull() // other version
    expect(decodeAnchorData("hello")).toBeNull()
  })
})
