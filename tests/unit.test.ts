import { describe, expect, it } from "vitest"
import { canonicalize } from "../shared/canonical.js"
import { scopeFromFormId, schemaHash, signalFromPayload } from "../shared/hash.js"
import { FIELD, isCanonicalDecimal, isCommitment, isFieldElement, sortLeaves } from "../shared/leaves.js"
import { validatePayload, validateSchema, type FormSchema } from "../shared/schema.js"
import { normalizeEmail, emailProvider } from "../server/providers/email.js"
import { validateEligibility } from "../server/providers/index.js"
import type { User } from "@supabase/supabase-js"

describe("canonical JSON vectors (shared by client and server)", () => {
  const vectors: [unknown, string][] = [
    [{ b: 1, a: 2 }, '{"a":2,"b":1}'],
    [{ z: { y: [3, { b: null, a: true }], x: "s" } }, '{"z":{"x":"s","y":[3,{"a":true,"b":null}]}}'],
    [[1, 2.5, -0, 1e21, 1e-7], "[1,2.5,0,1e+21,1e-7]"],
    ["é\n\"", '"é\\n\\""'],
    [{}, "{}"],
    [[], "[]"],
  ]
  it.each(vectors)("%j", (input, expected) => expect(canonicalize(input)).toBe(expected))
  it("rejects non-JSON values", () => {
    for (const bad of [undefined, NaN, Infinity, 1n, () => 1]) expect(() => canonicalize(bad)).toThrow()
    expect(() => canonicalize({ a: undefined })).toThrow()
  })
  it("is key-order independent", async () => {
    expect(await signalFromPayload({ a: 1, b: [1, 2] })).toBe(await signalFromPayload({ b: [1, 2], a: 1 }))
    expect(await signalFromPayload({ a: 1 })).not.toBe(await signalFromPayload({ a: 2 }))
  })
  it("matches independently computed hash vectors (Python hashlib)", async () => {
    expect(await signalFromPayload({ a: 1 })).toBe(
      "21821934526738070320276963191806244470535126754790962240671884631387220586728")
    expect(await scopeFromFormId("x")).toBe(
      "47736470149260168446582882626738457907066478862673879092042192434870685776968")
    expect(await schemaHash({ a: 1 })).toBe("015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862")
  })
})

describe("leaves", () => {
  it("sorts numerically, not lexically", () => {
    expect(sortLeaves(["10", "9", "100"])).toEqual([9n, 10n, 100n])
  })
  it("validates commitments", () => {
    expect(isCommitment("1")).toBe(true)
    expect(isCommitment("0")).toBe(false)
    expect(isCommitment("-1")).toBe(false)
    expect(isCommitment("1.5")).toBe(false)
    expect(isCommitment("21888242871839275222246405745257275088548364400416034343698204186575808495617")).toBe(false)
    expect(isCommitment(5)).toBe(false)
    expect(isCommitment("01")).toBe(false) // a respelling of 1
  })
  it("accepts only the canonical spelling of a number", () => {
    for (const ok of ["0", "7", "123456789", FIELD.toString().replace(/.$/, "0")]) expect(isCanonicalDecimal(ok), ok).toBe(true)
    for (const bad of ["", "07", "00", "-1", "+1", "1.0", " 1", "1 ", "1e3", "0x1", "١٢٣", "1".repeat(79), 7, null, undefined]) expect(isCanonicalDecimal(bad), String(bad)).toBe(false)
  })
  it("field elements are canonical and below the field order", () => {
    expect(isFieldElement("0")).toBe(true)
    expect(isFieldElement((FIELD - 1n).toString())).toBe(true)
    expect(isFieldElement(FIELD.toString())).toBe(false)
    expect(isFieldElement((FIELD + 5n).toString())).toBe(false)
    expect(isFieldElement("0" + (FIELD - 1n).toString())).toBe(false)
  })
})

const schema: FormSchema = {
  questions: [
    { id: "t", type: "text", label: "T", required: true, maxLength: 10 },
    { id: "tm", type: "text", label: "TM", required: false, multiline: true },
    { id: "s", type: "single", label: "S", required: true, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
    { id: "m", type: "multi", label: "M", required: false, minSelected: 1, maxSelected: 2,
      options: [{ id: "x", label: "X" }, { id: "y", label: "Y" }, { id: "z", label: "Z" }] },
    { id: "r", type: "rating", label: "R", required: false, max: 5 },
    { id: "n", type: "number", label: "N", required: false, min: 0, max: 10, integerOnly: true },
  ],
}
const ok = { t: "hi", s: "a" }

describe("schema validation", () => {
  it("accepts a valid schema", () => expect(validateSchema(schema)).toEqual([]))
  it("rejects bad schemas", () => {
    expect(validateSchema({})).not.toEqual([])
    expect(validateSchema({ questions: [] })).not.toEqual([])
    const q = (x: object) => validateSchema({ questions: [{ id: "q", label: "L", required: false, ...x }] })
    expect(q({ type: "single", options: [{ id: "a", label: "A" }] })).not.toEqual([])
    expect(q({ type: "single", options: [{ id: "a", label: "A" }, { id: "a", label: "B" }] })).not.toEqual([])
    expect(q({ type: "rating", max: 2 })).not.toEqual([])
    expect(q({ type: "rating", max: 11 })).not.toEqual([])
    expect(q({ type: "number", min: 5, max: 1 })).not.toEqual([])
    expect(q({ type: "text", maxLength: 0 })).not.toEqual([])
    expect(q({ type: "nope" })).not.toEqual([])
    expect(validateSchema({ questions: [
      { id: "q", type: "text", label: "A", required: false },
      { id: "q", type: "text", label: "B", required: false }] })).not.toEqual([])
  })
})

describe("payload validation", () => {
  const bad = (p: unknown) => expect(validatePayload(schema, p)).not.toBeNull()
  it("accepts valid payloads", () => {
    expect(validatePayload(schema, ok)).toBeNull()
    expect(validatePayload(schema, { ...ok, tm: "a\nb", m: ["x"], r: 5, n: 10 })).toBeNull()
  })
  it("rejects non-objects, unknown and missing required", () => {
    bad(null); bad([]); bad("x"); bad({ ...ok, extra: 1 }); bad({ s: "a" }); bad({ t: "hi" })
  })
  it("text", () => {
    bad({ ...ok, t: " hi" }); bad({ ...ok, t: "" }); bad({ ...ok, t: "x".repeat(11) })
    bad({ ...ok, t: 5 }); bad({ ...ok, t: "a\nb" })
  })
  it("single", () => { bad({ ...ok, s: "c" }); bad({ ...ok, s: ["a"] }); bad({ ...ok, s: "A" }) })
  it("multi", () => {
    bad({ ...ok, m: [] }); bad({ ...ok, m: ["q"] }); bad({ ...ok, m: ["x", "x"] })
    bad({ ...ok, m: ["x", "y", "z"] }); bad({ ...ok, m: "x" })
  })
  it("rating", () => { bad({ ...ok, r: 0 }); bad({ ...ok, r: 6 }); bad({ ...ok, r: 2.5 }); bad({ ...ok, r: "3" }) })
  it("number", () => {
    bad({ ...ok, n: -1 }); bad({ ...ok, n: 11 }); bad({ ...ok, n: 1.5 }); bad({ ...ok, n: "1" }); bad({ ...ok, n: null })
  })
})

const user = (o: Partial<User>) => ({ id: "u", ...o }) as User

describe("email provider", () => {
  it("normalizes", () => {
    expect(normalizeEmail("  Alice+Tag@Example.COM ")).toBe("alice+tag@example.com")
    expect(normalizeEmail("Alice+Tag@Example.COM", true)).toBe("alice@example.com")
    expect(normalizeEmail("a+b+c@x.io", true)).toBe("a@x.io")
  })
  it("refuses unconfirmed addresses", () => {
    expect(emailProvider.identify(user({ email: "a@x.io" }), { mode: "any" })).toBeNull()
  })
  const who = (email: string, strip = false) =>
    emailProvider.identify(user({ email, email_confirmed_at: "t" }), { mode: "any", stripPlusTag: strip })!
  it("allowlist, domain and any", () => {
    const allow = { mode: "allowlist" } as const
    expect(emailProvider.isEligible(who("A@x.io"), allow, ["a@x.io"])).toBe(true)
    expect(emailProvider.isEligible(who("b@x.io"), allow, ["a@x.io"])).toBe(false)
    expect(emailProvider.isEligible(who("a+1@x.io"), allow, ["a@x.io"])).toBe(false)
    const strip = { ...allow, stripPlusTag: true }
    expect(emailProvider.isEligible(who("a+1@x.io", true), strip, ["a@x.io"])).toBe(true)
    expect(who("a+1@x.io", true).subject).toBe(who("a+2@x.io", true).subject)
    const dom = { mode: "domain" } as const
    expect(emailProvider.isEligible(who("a@x.io"), dom, ["x.io"])).toBe(true)
    expect(emailProvider.isEligible(who("a@x.io"), dom, ["@x.io"])).toBe(true)
    expect(emailProvider.isEligible(who("a@sub.x.io"), dom, ["x.io"])).toBe(false)
    expect(emailProvider.isEligible(who("a@evilx.io"), dom, ["x.io"])).toBe(false)
    expect(emailProvider.isEligible(who("z@q.io"), { mode: "any" }, [])).toBe(true)
  })
  it("reads the verified email whichever method signed the person in", () => {
    // Supabase merges email and GitHub sign-ins that share a verified email into one account.
    const merged = user({
      email: "a@x.io", email_confirmed_at: "t",
      identities: [{ id: "1" } as never, { provider: "github", id: "42" } as never],
    })
    expect(emailProvider.identify(merged, { mode: "any" })).toEqual({ subject: "email:a@x.io", handle: "a@x.io" })
  })
  it("validates the stored policy, ignoring any leftover provider tag", () => {
    expect(validateEligibility({ mode: "domain" })).toBeNull()
    expect(validateEligibility({ provider: "email", mode: "any" })).toBeNull()
    expect(validateEligibility({ mode: "github" })).toMatch(/mode/)
    expect(validateEligibility(null)).toMatch(/object/)
  })
})
