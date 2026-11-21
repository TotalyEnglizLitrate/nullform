import { describe, expect, it } from "vitest"
import { aggregate, toCsv } from "../src/lib/results.js"
import type { FormSchema } from "../shared/schema.js"

const schema: FormSchema = {
  questions: [
    { id: "s", type: "single", label: "Colour", required: true, options: [{ id: "r", label: "Red" }, { id: "b", label: "Blue" }] },
    { id: "m", type: "multi", label: "Toppings", required: false, options: [{ id: "x", label: "Ham" }, { id: "y", label: "Egg, fried" }, { id: "z", label: "Nuts" }] },
    { id: "r", type: "rating", label: "Rate", required: false, max: 4 },
    { id: "n", type: "number", label: "Age", required: false },
    { id: "t", type: "text", label: "Comment", required: false },
  ],
}
const data = [
  { s: "r", m: ["x", "y"], r: 4, n: 30, t: "fine" },
  { s: "b", m: ["x"], r: 2, n: 10 },
  { s: "r", r: 3, n: -5, t: "=SUM(A1)" },
]

describe("aggregate", () => {
  const [s, m, r, n, t] = aggregate(schema, data)
  it("counts single and multiple choice, with zero-count options kept", () => {
    expect(s).toMatchObject({ kind: "choice", answered: 3 })
    expect((s as { options: unknown }).options).toEqual([{ id: "r", label: "Red", count: 2 }, { id: "b", label: "Blue", count: 1 }])
    expect(m).toMatchObject({ answered: 2 })
    expect((m as { options: { count: number }[] }).options.map((o) => o.count)).toEqual([2, 1, 0])
  })
  it("builds rating distribution and mean", () => {
    expect(r).toMatchObject({ kind: "rating", answered: 3, max: 4, counts: [0, 1, 1, 1], mean: 3 })
  })
  it("summarises numbers", () => {
    expect(n).toMatchObject({ kind: "number", answered: 3, min: -5, max: 30, mean: 35 / 3 })
  })
  it("collects text answers and skips unanswered", () => {
    expect(t).toMatchObject({ kind: "text", answered: 2, answers: ["fine", "=SUM(A1)"] })
  })
  it("handles no responses without dividing by zero", () => {
    const empty = aggregate(schema, [])
    expect(empty[2]).toMatchObject({ answered: 0, mean: null })
    expect(empty[3]).toMatchObject({ answered: 0, min: null, max: null, mean: null })
  })
  it("ignores values that don't fit the question", () => {
    const odd = aggregate(schema, [{ s: "nope", m: "x", r: 99, n: "7", t: 5 }])
    expect(odd[0]).toMatchObject({ answered: 0 })
    expect(odd[1]).toMatchObject({ answered: 0 })
    expect(odd[2]).toMatchObject({ answered: 0 })
    expect(odd[3]).toMatchObject({ answered: 0 })
    expect(odd[4]).toMatchObject({ answered: 0 })
  })
})

describe("toCsv", () => {
  const lines = toCsv(schema, data).replace("﻿", "").split("\r\n")
  it("has a BOM, a header row and one row per response", () => {
    expect(toCsv(schema, data).startsWith("﻿")).toBe(true)
    expect(lines[0]).toBe("Colour,Toppings,Rate,Age,Comment")
    expect(lines).toHaveLength(5) // header + 3 rows + trailing empty
  })
  it("writes option labels, joins multiples, leaves blanks, quotes commas", () => {
    expect(lines[1]).toBe('Red,"Ham; Egg, fried",4,30,fine')
    expect(lines[2]).toBe("Blue,Ham,2,10,")
  })
  it("neutralises spreadsheet formulas in text but keeps negative numbers numeric", () => {
    expect(lines[3]).toBe("Red,,3,-5,'=SUM(A1)")
  })
  it("escapes quotes and newlines", () => {
    const csv = toCsv({ questions: [{ id: "t", type: "text", label: 'He said "hi"', required: false, multiline: true }] },
      [{ t: 'a "b"\nc' }])
    expect(csv).toContain('"He said ""hi"""')
    expect(csv).toContain('"a ""b""\nc"')
  })
})
