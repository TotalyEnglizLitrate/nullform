import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { ConfigError } from "./http.js"

let client: SupabaseClient | undefined

/** Service-role client. Bypasses RLS, so it must only ever be used inside server handlers. */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SECRET_KEY
    if (!url || !key) throw new ConfigError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set")
    // A real key is plain ASCII. The Supabase CLI lists secret keys masked with dots, and pasting that
    // placeholder in makes every request fail with "Invalid API key", so say so plainly.
    if (!/^[A-Za-z0-9._-]+$/.test(key))
      throw new ConfigError("SUPABASE_SECRET_KEY has characters a real key never has; it may be a masked copy. Copy the full key from the Supabase dashboard (Project Settings, API Keys).")
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return client
}
