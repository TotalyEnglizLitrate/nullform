/** BN254 scalar field order: valid identity commitments are in [1, FIELD). */
export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n

/**
 * A canonical decimal: no sign, no leading zeros, no spaces, at most 78 digits.
 * Two spellings of one number ("7" and "07") must never count as two different values: the proof verifier
 * reads both as the same number, so anything keyed on the string (nullifiers!) has to accept one spelling only.
 */
export const isCanonicalDecimal = (s: unknown): s is string => typeof s === "string" && /^(0|[1-9][0-9]{0,77})$/.test(s)

/** A canonical decimal that is a valid field element, in [0, FIELD). */
export const isFieldElement = (s: unknown): s is string => isCanonicalDecimal(s) && BigInt(s) < FIELD

export const isCommitment = (s: unknown): s is string => isFieldElement(s) && BigInt(s) > 0n

/** Leaves are sorted by numeric value, so insertion order never leaks. Client and server use this. */
export function sortLeaves(leaves: string[]): bigint[] {
  return leaves.map((l) => BigInt(l)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}
