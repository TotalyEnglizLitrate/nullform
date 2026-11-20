/**
 * Canonical JSON: object keys sorted (UTF-16 code unit order), no whitespace, -0 as 0.
 * Client and server must produce byte-identical output, because the signal is a hash of it.
 * Anything that is not plain JSON (undefined, NaN, Infinity, bigint, functions) throws.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null"
  switch (typeof value) {
    case "string":
      return JSON.stringify(value)
    case "boolean":
      return value ? "true" : "false"
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("canonicalize: non-finite number")
      return JSON.stringify(Object.is(value, -0) ? 0 : value)
    case "object": {
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
      const obj = value as Record<string, unknown>
      const body = Object.keys(obj)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
      return `{${body.join(",")}}`
    }
    default:
      throw new TypeError(`canonicalize: unsupported type ${typeof value}`)
  }
}
