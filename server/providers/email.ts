import type { AuthProvider, Eligibility } from "./types.js"

export function normalizeEmail(email: string, stripPlusTag = false): string {
  const e = email.trim().toLowerCase()
  const at = e.lastIndexOf("@")
  if (at < 1) return e
  const local = stripPlusTag ? e.slice(0, at).split("+")[0]! : e.slice(0, at)
  return `${local}${e.slice(at)}`
}

export const emailProvider: AuthProvider = {
  id: "email",
  methods: ["otp", "magiclink"],
  identify(user, policy) {
    // Following the emailed sign-in link proves control of the inbox; refuse unconfirmed addresses regardless.
    if (!user.email || !user.email_confirmed_at) return null
    const strip = policy.provider === "email" && policy.stripPlusTag === true
    const normalized = normalizeEmail(user.email, strip)
    return { subject: `email:${normalized}`, handle: normalized }
  },
  isEligible(who, policy, allowlist) {
    if (policy.provider !== "email") return false
    if (policy.mode === "any") return true
    if (policy.mode === "domain") {
      const domain = who.handle.slice(who.handle.lastIndexOf("@") + 1)
      return allowlist.some((d) => d.replace(/^@/, "") === domain)
    }
    const strip = policy.stripPlusTag === true
    return allowlist.some((entry) => normalizeEmail(entry, strip) === who.handle)
  },
  validatePolicy(p) {
    if (!["allowlist", "domain", "any"].includes(p.mode as string)) return "email mode must be allowlist, domain or any"
    return null
  },
}
