import { canonicalize } from "./canonical.js"

const enc = new TextEncoder()

async function sha256Bytes(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(input)))
}

export async function sha256Hex(input: string): Promise<string> {
  return [...(await sha256Bytes(input))].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** SHA-256 as a decimal string. Semaphore hashes `message` and `scope` itself, so any 256-bit number is valid. */
async function sha256Decimal(input: string): Promise<string> {
  return BigInt(`0x${await sha256Hex(input)}`).toString()
}

/** signal = hash(canonical_json(payload)); binds a proof to the exact answers. */
export const signalFromPayload = (payload: unknown) =>
  sha256Decimal(`nullform:signal:${canonicalize(payload)}`)

/** scope = hash(form_id); one nullifier per member per form. */
export const scopeFromFormId = (formId: string) => sha256Decimal(`nullform:scope:${formId}`)

/** Hash of the locked form schema, stored at registration open and shown on the audit page. */
export const schemaHash = (schema: unknown) => sha256Hex(canonicalize(schema))
