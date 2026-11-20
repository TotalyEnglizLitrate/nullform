export type Option = { id: string; label: string }
type Base = { id: string; label: string; required: boolean }
export type Question =
  | (Base & { type: "text"; multiline?: boolean; maxLength?: number })
  | (Base & { type: "single"; options: Option[] })
  | (Base & { type: "multi"; options: Option[]; minSelected?: number; maxSelected?: number })
  | (Base & { type: "rating"; max?: number })
  | (Base & { type: "number"; min?: number; max?: number; integerOnly?: boolean })
export type FormSchema = { questions: Question[] }
export type Payload = Record<string, unknown>

const ID = /^[a-z0-9_-]{1,32}$/
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x)
const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x)

export const TEXT_DEFAULT_MAX = 1000
export const TEXT_HARD_MAX = 10000
export const RATING_DEFAULT_MAX = 5

function checkOptions(q: Record<string, unknown>, min: number, max: number, errs: string[], at: string) {
  const opts = q.options
  if (!Array.isArray(opts) || opts.length < min || opts.length > max) {
    errs.push(`${at}: needs ${min} to ${max} options`)
    return
  }
  const seen = new Set<string>()
  for (const o of opts) {
    if (!isObj(o) || typeof o.id !== "string" || !ID.test(o.id) || typeof o.label !== "string" || !o.label.trim()) {
      errs.push(`${at}: invalid option`)
      return
    }
    if (seen.has(o.id)) errs.push(`${at}: duplicate option id ${o.id}`)
    seen.add(o.id)
  }
}

/** Returns a list of problems; an empty list means the schema is valid. */
export function validateSchema(schema: unknown): string[] {
  const errs: string[] = []
  if (!isObj(schema) || !Array.isArray(schema.questions)) return ["schema: questions array required"]
  const qs = schema.questions
  if (qs.length < 1 || qs.length > 50) return ["schema: 1 to 50 questions"]
  const ids = new Set<string>()
  qs.forEach((q, i) => {
    const at = `question ${i + 1}`
    if (!isObj(q)) return void errs.push(`${at}: not an object`)
    if (typeof q.id !== "string" || !ID.test(q.id)) errs.push(`${at}: invalid id`)
    else if (ids.has(q.id)) errs.push(`${at}: duplicate id`)
    else ids.add(q.id)
    if (typeof q.label !== "string" || !q.label.trim() || q.label.length > 500) errs.push(`${at}: invalid label`)
    if (typeof q.required !== "boolean") errs.push(`${at}: required must be boolean`)
    switch (q.type) {
      case "text":
        if (q.maxLength !== undefined && (!isInt(q.maxLength) || q.maxLength < 1 || q.maxLength > TEXT_HARD_MAX))
          errs.push(`${at}: maxLength must be 1 to ${TEXT_HARD_MAX}`)
        break
      case "single":
        checkOptions(q, 2, 10, errs, at)
        break
      case "multi": {
        checkOptions(q, 2, 20, errs, at)
        const n = Array.isArray(q.options) ? q.options.length : 0
        const lo = q.minSelected ?? 0
        const hi = q.maxSelected ?? n
        if (!isInt(lo) || !isInt(hi) || lo < 0 || hi < 1 || lo > hi || hi > n)
          errs.push(`${at}: invalid minSelected/maxSelected`)
        break
      }
      case "rating":
        if (q.max !== undefined && (!isInt(q.max) || q.max < 3 || q.max > 10)) errs.push(`${at}: rating max must be 3 to 10`)
        break
      case "number":
        for (const k of ["min", "max"] as const)
          if (q[k] !== undefined && !(typeof q[k] === "number" && Number.isFinite(q[k]))) errs.push(`${at}: invalid ${k}`)
        if (typeof q.min === "number" && typeof q.max === "number" && q.min > q.max) errs.push(`${at}: min > max`)
        break
      default:
        errs.push(`${at}: unknown type`)
    }
  })
  return errs
}

/**
 * Validates answers against a (valid) schema. Strict on purpose: the payload is hashed as sent,
 * so the server never normalizes it. Text must already be trimmed, optional answers omitted.
 */
export function validatePayload(schema: FormSchema, payload: unknown): string | null {
  if (!isObj(payload)) return "payload must be an object"
  const byId = new Map(schema.questions.map((q) => [q.id, q]))
  for (const key of Object.keys(payload)) if (!byId.has(key)) return `unknown question ${key}`
  for (const q of schema.questions) {
    const v = payload[q.id]
    if (v === undefined) {
      if (q.required) return `${q.id}: required`
      continue
    }
    const bad = (m: string) => `${q.id}: ${m}`
    switch (q.type) {
      case "text": {
        if (typeof v !== "string") return bad("must be a string")
        if (v !== v.trim() || v.length === 0) return bad("must be trimmed and non-empty (omit if unanswered)")
        if (v.length > (q.maxLength ?? TEXT_DEFAULT_MAX)) return bad("too long")
        if (!q.multiline && /[\r\n]/.test(v)) return bad("must be a single line")
        break
      }
      case "single":
        if (typeof v !== "string" || !q.options.some((o) => o.id === v)) return bad("invalid option")
        break
      case "multi": {
        if (!Array.isArray(v) || v.length === 0) return bad("must be a non-empty array (omit if unanswered)")
        if (!v.every((x) => typeof x === "string" && q.options.some((o) => o.id === x))) return bad("invalid option")
        if (new Set(v).size !== v.length) return bad("duplicate option")
        if (v.length < (q.minSelected ?? 0) || v.length > (q.maxSelected ?? q.options.length)) return bad("wrong number selected")
        break
      }
      case "rating":
        if (!isInt(v) || v < 1 || v > (q.max ?? RATING_DEFAULT_MAX)) return bad("out of range")
        break
      case "number":
        if (typeof v !== "number" || !Number.isFinite(v)) return bad("must be a finite number")
        if (q.integerOnly && !Number.isInteger(v)) return bad("must be an integer")
        if (q.min !== undefined && v < q.min) return bad("below minimum")
        if (q.max !== undefined && v > q.max) return bad("above maximum")
        break
    }
  }
  return null
}
