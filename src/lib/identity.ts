import { Identity } from "@semaphore-protocol/identity"
import { sha256Hex } from "../../shared/hash.js"

const enc = new TextEncoder()

export const newMaster = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32))

/**
 * One master secret per browser; one Semaphore identity per form, derived with HKDF.
 * Reusing a single identity everywhere would make a member's commitment linkable across forms.
 */
export async function deriveIdentity(master: Uint8Array, formId: string): Promise<Identity> {
  if (master.length !== 32) throw new Error("master secret must be 32 bytes")
  const key = await crypto.subtle.importKey("raw", master as BufferSource, "HKDF", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("nullform:identity:v1"), info: enc.encode(formId) },
    key,
    256,
  )
  return new Identity(new Uint8Array(bits))
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
const checksum = async (master: Uint8Array) => (await sha256Hex(`nullform:backup:${b64(master)}`)).slice(0, 6)

/** Backup string the member can store anywhere: `nf1-<secret>-<checksum>`. */
export async function encodeBackup(master: Uint8Array): Promise<string> {
  return `nf1-${b64(master)}-${await checksum(master)}`
}

export async function decodeBackup(text: string): Promise<Uint8Array> {
  const m = /^nf1-([A-Za-z0-9_-]{43})-([0-9a-f]{6})$/.exec(text.trim())
  if (!m) throw new Error("not a valid backup string")
  const master = unb64(m[1]!)
  if (master.length !== 32 || (await checksum(master)) !== m[2]) throw new Error("backup string is damaged")
  return master
}
