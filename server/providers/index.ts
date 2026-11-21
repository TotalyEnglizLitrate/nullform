import type { Eligibility } from "./types.js"

export type { Eligibility, Subject } from "./types.js"

const MODES = ["allowlist", "domain", "any"]

/** Returns a problem description, or null if the stored policy is well formed. */
export function validateEligibility(e: unknown): string | null {
  if (typeof e !== "object" || e === null) return "eligibility must be an object"
  if (!MODES.includes((e as Record<string, unknown>).mode as string)) return "eligibility mode must be allowlist, domain or any"
  return null
}

export const needsAllowlist = (e: Eligibility) => e.mode !== "any"
