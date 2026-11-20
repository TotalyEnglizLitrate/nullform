import type { User } from "@supabase/supabase-js"

/** Per-form eligibility policy, stored in forms.eligibility. */
export type Eligibility =
  | { provider: "email"; mode: "allowlist" | "domain" | "any"; stripPlusTag?: boolean }
  | { provider: "github"; mode: "allowlist" | "any" }

export type ProviderId = Eligibility["provider"]

/** What an auth method resolves to: a canonical, per-form-unique subject. */
export interface Subject {
  subject: string
  /** Value compared against allowlist entries (email, or GitHub handle). */
  handle: string
}

/** One sign-in method. Add a provider by implementing this and listing it in providers/index.ts. */
export interface AuthProvider {
  id: ProviderId
  /** The Supabase session method (JWT `amr`) that means "signed in with this provider". */
  methods: string[]
  identify(user: User, policy: Eligibility): Subject | null
  isEligible(who: Subject, policy: Eligibility, allowlist: string[]): boolean
  validatePolicy(policy: Record<string, unknown>): string | null
}
