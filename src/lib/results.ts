import type { FormSchema, Payload, Question } from "../../shared/schema.js"

export interface OptionCount { id: string; label: string; count: number }

export type QuestionStats =
  | { kind: "choice"; question: Question; answered: number; options: OptionCount[] }
  | { kind: "rating"; question: Question; answered: number; max: number; counts: number[]; mean: number | null }
  | { kind: "number"; question: Question; answered: number; min: number | null; max: number | null; mean: number | null }
  | { kind: "text"; question: Question; answered: number; answers: string[] }

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/** Per-question aggregates. Defensive about odd data: values that don't fit the question are ignored. */
export function aggregate(schema: FormSchema, payloads: Payload[]): QuestionStats[] {
  return schema.questions.map((q): QuestionStats => {
    const values = payloads.map((p) => p[q.id]).filter((v) => v !== undefined)
    switch (q.type) {
      case "single":
      case "multi": {
        const counts = new Map(q.options.map((o) => [o.id, 0]))
        let answered = 0
        for (const v of values) {
          const picked = (q.type === "single" ? [v] : Array.isArray(v) ? v : []).filter((x) => typeof x === "string" && counts.has(x))
          if (picked.length) answered++
          for (const id of new Set(picked as string[])) counts.set(id, counts.get(id)! + 1)
        }
        return { kind: "choice", question: q, answered, options: q.options.map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id)! })) }
      }
      case "rating": {
        const max = q.max ?? 5
        const nums = values.filter((v): v is number => isNum(v) && Number.isInteger(v) && v >= 1 && v <= max)
        const counts = Array.from({ length: max }, (_, i) => nums.filter((n) => n === i + 1).length)
        return { kind: "rating", question: q, answered: nums.length, max, counts, mean: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null }
      }
      case "number": {
        const nums = values.filter(isNum)
        return {
          kind: "number", question: q, answered: nums.length,
          min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null,
          mean: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
        }
      }
      case "text": {
        const answers = values.filter((v): v is string => typeof v === "string")
        return { kind: "text", question: q, answered: answers.length, answers }
      }
    }
  })
}

/** Text cell for one answer, for CSV: option labels for choices, blank when unanswered. */
function cell(q: Question, v: unknown): string | number {
  if (v === undefined || v === null) return ""
  if (q.type === "single") return q.options.find((o) => o.id === v)?.label ?? ""
  if (q.type === "multi")
    return Array.isArray(v) ? v.map((id) => q.options.find((o) => o.id === id)?.label).filter(Boolean).join("; ") : ""
  if (q.type === "rating" || q.type === "number") return isNum(v) ? v : ""
  return typeof v === "string" ? v : ""
}

/**
 * Spreadsheet apps run cells that start with = + - @ (or tab/CR) as formulas, so a respondent
 * could plant one in a free-text answer. Prefix such strings with an apostrophe. Numbers are exempt.
 */
function csvField(v: string | number): string {
  let s = String(v)
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One row per response, one column per question, UTF-8 with BOM so Excel reads accents correctly. */
export function toCsv(schema: FormSchema, payloads: Payload[]): string {
  const rows = [schema.questions.map((q) => q.label), ...payloads.map((p) => schema.questions.map((q) => cell(q, p[q.id])))]
  return `﻿${rows.map((r) => r.map(csvField).join(",")).join("\r\n")}\r\n`
}
