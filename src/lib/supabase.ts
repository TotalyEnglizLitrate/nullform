import { createClient } from "@supabase/supabase-js"

/**
 * Public client (publishable key): all access goes through RLS.
 * PKCE keeps the OAuth result in the query string, so it can't collide with the hash router.
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  { auth: { flowType: "pkce" } },
)
