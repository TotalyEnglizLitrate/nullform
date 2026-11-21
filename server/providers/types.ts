/**
 * Per-form eligibility policy, stored in forms.eligibility. It is about the person's verified email address, not
 * about how they sign in: Supabase merges email and GitHub sign-ins that share a verified email into one account.
 */
export type Eligibility = { mode: "allowlist" | "domain" | "any"; stripPlusTag?: boolean }

/** What an account resolves to: a canonical, per-form-unique subject. */
export interface Subject {
  subject: string
  /** Value compared against allowlist entries (a verified email). */
  handle: string
}
