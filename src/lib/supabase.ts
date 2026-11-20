import { createClient } from "@supabase/supabase-js"

/** Public client (publishable key): all access goes through RLS. */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
)
