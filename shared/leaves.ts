/** BN254 scalar field order: valid identity commitments are in [1, FIELD). */
export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n

export function isCommitment(s: unknown): s is string {
  if (typeof s !== "string" || !/^[0-9]{1,78}$/.test(s)) return false
  const n = BigInt(s)
  return n > 0n && n < FIELD
}

/** Leaves are sorted by numeric value, so insertion order never leaks. Client and server use this. */
export function sortLeaves(leaves: string[]): bigint[] {
  return leaves.map((l) => BigInt(l)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}
