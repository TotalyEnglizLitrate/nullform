import type { AuthProvider } from "./types.js"

export const githubProvider: AuthProvider = {
  id: "github",
  methods: ["oauth"],
  identify(user) {
    const identity = user.identities?.find((i) => i.provider === "github")
    const id = identity?.id ?? (user.user_metadata?.provider_id as string | undefined)
    const login = (identity?.identity_data?.user_name ?? user.user_metadata?.user_name) as string | undefined
    if (!id || !login) return null
    // Subject is the immutable numeric id; the handle is only used to match allowlist entries.
    return { subject: `github:${id}`, handle: String(login).toLowerCase() }
  },
  isEligible(who, policy, allowlist) {
    if (policy.provider !== "github") return false
    if (policy.mode === "any") return true
    return allowlist.some((entry) => entry.replace(/^@/, "") === who.handle)
  },
  validatePolicy(p) {
    if (!["allowlist", "any"].includes(p.mode as string)) return "github mode must be allowlist or any"
    return null
  },
}
