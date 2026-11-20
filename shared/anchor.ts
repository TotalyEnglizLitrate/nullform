/**
 * Anchor calldata: a self-sent transaction whose input is
 *   "NULLFRM1" (8 bytes) | form id (16 bytes) | group root (32 bytes)
 * No contract is needed; anyone can read the input on a block explorer.
 * Pure string handling so the server (viem) and the browser (plain JSON-RPC) share it.
 */
const MAGIC = "4e554c4c46524d31" // "NULLFRM1"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX = (1n << 256n) - 1n

export function encodeAnchorData(formId: string, root: string): `0x${string}` {
  if (!UUID.test(formId)) throw new Error("invalid form id")
  if (!/^[0-9]{1,78}$/.test(root) || BigInt(root) > MAX) throw new Error("invalid root")
  return `0x${MAGIC}${formId.replace(/-/g, "").toLowerCase()}${BigInt(root).toString(16).padStart(64, "0")}`
}

/** Returns null for anything that isn't a well-formed Nullform anchor. */
export function decodeAnchorData(input: string): { formId: string; root: string } | null {
  const m = /^0x([0-9a-f]{16})([0-9a-f]{32})([0-9a-f]{64})$/i.exec(input)
  if (!m || m[1]!.toLowerCase() !== MAGIC) return null
  const h = m[2]!.toLowerCase()
  const formId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  return { formId, root: BigInt(`0x${m[3]}`).toString() }
}
