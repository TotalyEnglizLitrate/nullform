import { emailProvider } from "./email.js"
import { githubProvider } from "./github.js"
import type { AuthProvider, Eligibility, ProviderId } from "./types.js"

export type { AuthProvider, Eligibility, ProviderId, Subject } from "./types.js"

const providers: Record<ProviderId, AuthProvider> = { email: emailProvider, github: githubProvider }

export const getProvider = (id: unknown): AuthProvider | undefined =>
  typeof id === "string" && Object.hasOwn(providers, id) ? providers[id as ProviderId] : undefined

/** Returns a problem description, or null if the stored policy is well formed. */
export function validateEligibility(e: unknown): string | null {
  if (typeof e !== "object" || e === null) return "eligibility must be an object"
  const p = getProvider((e as Record<string, unknown>).provider)
  if (!p) return "unknown provider"
  return p.validatePolicy(e as Record<string, unknown>)
}

export const needsAllowlist = (e: Eligibility) => e.mode !== "any"
